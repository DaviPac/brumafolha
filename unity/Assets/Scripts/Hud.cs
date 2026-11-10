// The UI over the game, drawn with Unity's immediate-mode GUI: party frames, hotbar, quest tracker, banner, log,
// floating numbers, toasts, tooltip, initiative, dialogue, the d20, hints, the pause menu, title, fades and the end.
// Ported from src/ui.js, the DOM in index.html and style.css.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace Brumafolha
{
    public static class Hud
    {
        // ---------------------------------------------------------------- palette (style.css :root)
        public static readonly Color INK = Gfx.Hex("#120e16"), PANEL = new Color(16 / 255f, 14 / 255f, 22 / 255f, 0.82f), EDGE = Gfx.Hex("#6b5a3a"), GOLD = Gfx.Hex("#e8c06a"),
            GOLD_DIM = Gfx.Hex("#9a7a3a"), TEAL = Gfx.Hex("#5fd0c8"), TEXT = Gfx.Hex("#efe6d2"), MUTED = Gfx.Hex("#a89c86"), HP = Gfx.Hex("#d8462e"), HP_HI = Gfx.Hex("#ff8a4a"),
            GOOD = Gfx.Hex("#8fd65a"), BAD = Gfx.Hex("#ff6a5a");

        public static Font body, title, bodyBold, titleBold;
        static GUIStyle sBase;
        static readonly Dictionary<string, GUIStyle> styles = new Dictionary<string, GUIStyle>();

        public static void InitFonts()
        {
            // the same faces and weights the web page loads from Google Fonts: Pixelify Sans 400/600, Cinzel 500/700
            body = Resources.Load<Font>("Fonts/PixelifySans") ?? Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            bodyBold = Resources.Load<Font>("Fonts/PixelifySansBold");
            title = Resources.Load<Font>("Fonts/Cinzel") ?? body;
            titleBold = Resources.Load<Font>("Fonts/CinzelBold");
        }
        /// <summary>A cached text style: size, colour, font (body or title), alignment, wrapping.</summary>
        public static GUIStyle S(int size, Color c, bool head = false, TextAnchor a = TextAnchor.UpperLeft, bool wrap = true, FontStyle fs = FontStyle.Normal)
        {
            string k = $"{size}|{c}|{head}|{a}|{wrap}|{fs}";
            if (styles.TryGetValue(k, out var st)) return st;
            sBase ??= new GUIStyle(GUIStyle.none);
            bool bold = fs == FontStyle.Bold || fs == FontStyle.BoldAndItalic;
            var boldFace = head ? titleBold : bodyBold;
            var face = bold && boldFace != null ? boldFace : head ? title : body;
            if (bold && boldFace != null) fs = fs == FontStyle.BoldAndItalic ? FontStyle.Italic : FontStyle.Normal;
            st = new GUIStyle(sBase) { font = face, fontSize = size, alignment = a, wordWrap = wrap, richText = true, fontStyle = fs, clipping = TextClipping.Overflow };
            st.normal.textColor = c;
            styles[k] = st;
            return st;
        }

        // ---------------------------------------------------------------- drawing helpers
        static readonly Dictionary<string, Texture2D> grads = new Dictionary<string, Texture2D>();
        /// <summary>CSS linear-gradient(top, bottom), vertical.</summary>
        public static void VGrad(Rect r, Color top, Color bottom)
        {
            string k = "v" + top + bottom;
            if (!grads.TryGetValue(k, out var t))
            {
                t = new Texture2D(1, 64, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
                for (int y = 0; y < 64; y++) t.SetPixel(0, y, Color.Lerp(bottom, top, y / 63f));
                t.Apply(); grads[k] = t;
            }
            GUI.DrawTexture(r, t, ScaleMode.StretchToFill, true);
        }
        /// <summary>CSS radial-gradient(circle at cx cy, inner, outer) stretched over the rect.</summary>
        public static void Radial(Rect r, Color inner, Color outer, float cx = 0.5f, float cy = 0.5f, float stop0 = 0, float stop1 = 1)
        {
            string k = $"r{inner}{outer}{cx}{cy}{stop0}{stop1}";
            if (!grads.TryGetValue(k, out var t))
            {
                const int N = 128;
                t = new Texture2D(N, N, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
                // distance to the farthest corner, like CSS's default size
                float fx = Mathf.Max(cx, 1 - cx), fy = Mathf.Max(cy, 1 - cy), far = Mathf.Sqrt(fx * fx + fy * fy);
                for (int y = 0; y < N; y++) for (int x = 0; x < N; x++)
                    {
                        float u = x / (N - 1f) - cx, v = (1 - y / (N - 1f)) - cy;
                        float d = Mathf.Sqrt(u * u + v * v) / far;
                        t.SetPixel(x, y, Color.Lerp(inner, outer, Mathf.InverseLerp(stop0, stop1, d)));
                    }
                t.Apply(); grads[k] = t;
            }
            GUI.DrawTexture(r, t, ScaleMode.StretchToFill, true);
        }
        public static void Fill(Rect r, Color c, float radius = 0) { if (c.a <= 0) return; GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, c, 0, radius); }
        public static void Border(Rect r, Color c, float w = 1, float radius = 0) => GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, c, w, radius);
        public static void Frame(Rect r, Color fill, Color edge, float w = 1, float radius = 0) { Fill(r, fill, radius); Border(r, edge, w, radius); }
        /// <summary>Text with a 1px dark shadow under it, like the CSS text-shadow everywhere.</summary>
        public static void Text(Rect r, string s, GUIStyle st, bool shadow = true)
        {
            if (string.IsNullOrEmpty(s)) return;
            if (shadow)
            {
                var c = st.normal.textColor; st.normal.textColor = new Color(0, 0, 0, c.a * 0.85f);
                GUI.Label(new Rect(r.x, r.y + 2, r.width, r.height), StripColors(s), st);
                st.normal.textColor = c;
            }
            GUI.Label(r, s, st);
        }
        static readonly System.Text.RegularExpressions.Regex COLORTAG = new System.Text.RegularExpressions.Regex("</?color[^>]*>");
        static string StripColors(string s) => COLORTAG.Replace(s, "");
        public static float H(string s, GUIStyle st, float w) => st.CalcHeight(new GUIContent(s), w);
        public static float W(string s, GUIStyle st) => st.CalcSize(new GUIContent(s)).x;
        public static void Pic(Rect r, Img img, Color? tint = null)
        {
            if (img == null) return;
            float tw = img.tex.width, th = img.tex.height;
            var uv = new Rect(img.x / tw, 1 - (img.y + img.h) / th, img.w / tw, img.h / th);
            var prev = GUI.color; if (tint.HasValue) GUI.color = tint.Value;
            GUI.DrawTextureWithTexCoords(r, img.tex, uv);
            GUI.color = prev;
        }
        public static Vector2 Mouse => Event.current.mousePosition;
        public static bool Hover(Rect r) => r.Contains(Mouse);
        /// <summary>A clickable area (draws nothing): true on click.</summary>
        public static bool Click(Rect r) => GUI.Button(r, GUIContent.none, GUIStyle.none);
        /// <summary>Swallow clicks on a panel so they don't reach the world behind it. Call after its buttons.</summary>
        public static void Block(Rect r) { var e = Event.current; if ((e.type == EventType.MouseDown || e.type == EventType.MouseUp) && r.Contains(e.mousePosition)) e.Use(); }
        /// <summary>The game's gold-on-brown button.</summary>
        public static bool Button(Rect r, string label, int size = 16, bool on = false, bool disabled = false)
        {
            bool hov = Hover(r) && !disabled;
            Fill(r, disabled ? new Color(0.12f, 0.1f, 0.1f, 0.9f) : hov || on ? Gfx.Hex("#5a3a1a") : Gfx.Hex("#2a1a0e"));
            Border(r, hov || on ? GOLD : GOLD_DIM, 2);
            Text(r, label, S(size, disabled ? MUTED : hov ? Color.white : GOLD, true, TextAnchor.MiddleCenter, false, FontStyle.Bold), false);
            if (disabled) { GUI.Button(r, GUIContent.none, GUIStyle.none); return false; }
            bool c = Click(r);
            if (c) Snd.click();
            return c;
        }
        /// <summary>A flat chip / card button used in menus.</summary>
        public static bool Chip(Rect r, string label, bool on, int size = 13, TextAnchor a = TextAnchor.MiddleCenter, float radius = 4)
        {
            bool hov = Hover(r);
            Fill(r, on ? Gfx.Hex("#3a2c14") : Gfx.Hex("#1c1824"), radius);
            Border(r, on ? GOLD : hov ? GOLD_DIM : Gfx.Hex("#4a3e2a"), 1, radius);
            var pad = new Rect(r.x + 8, r.y + 4, r.width - 16, r.height - 8);
            GUI.Label(pad, label, S(size, on ? GOLD : TEXT, false, a));
            return Click(r);
        }

        // ---------------------------------------------------------------- state
        class FloatText { public float x, y, t, jx; public string text, cls; }
        static readonly List<FloatText> floaters = new List<FloatText>();
        static readonly List<(string html, string cls)> logLines = new List<(string, string)>();
        static string toastText; static float toastT, toastA;
        static string bannerText; static float bannerT, bannerA;
        static string tooltipHtml;
        public static float fadeA, fadeFrom, fadeTo, fadeT, fadeDur; public static Color fadeColor = Color.black;
        public static string cineHtml, cineCls;
        public class Slot { public string icon, name, desc; public bool off, sel; public int? count; public Action use; }
        static List<Slot> hotbar = new List<Slot>();
        static bool hotbarCombat;
        public static bool overUI;

        public static void Floater(float x, float y, string text, string cls = "dmg") => floaters.Add(new FloatText { x = x, y = y, text = text, cls = cls, jx = U.Rand() * 16 - 8 });
        public static void Log(string html, string cls = "")
        {
            logLines.Add((Rich.Html(html), cls));
            while (logLines.Count > 9) logLines.RemoveAt(0);
        }
        public static void Toast(string text, int ms = 2200) { toastText = text; toastT = ms / 1000f; }
        public static void Banner(string text) { bannerText = text; bannerT = 3.2f; }
        public static void Tooltip(string html) { tooltipHtml = html; }
        public static void BuildHotbar(List<Slot> entries, bool combat = false) { hotbar = entries; hotbarCombat = combat; }
        public static void UseSlot(int i) { if (i >= 0 && i < hotbar.Count && !hotbar[i].off) { Snd.click(); hotbar[i].use(); } }

        /// <summary>Fade the whole screen to a colour (1) or back (0).</summary>
        public static Task Fade(float to, int ms = 800, string color = null)
        {
            if (to > 0 && color != null) fadeColor = Gfx.Hex(color);
            else if (to > 0) fadeColor = Color.black;
            fadeFrom = fadeA; fadeTo = to; fadeT = 0; fadeDur = ms / 1000f;
            if (ms <= 0) fadeA = to;
            return Game.SleepReal(ms + 30);
        }
        /// <summary>Centered text over the screen, for title cards and narration in the dark. Empty hides it.</summary>
        public static void Cine(string html, string cls = "") { cineHtml = string.IsNullOrEmpty(html) ? null : html; cineCls = cls; }

        public static void Update(float dt)
        {
            for (int i = floaters.Count - 1; i >= 0; i--) if ((floaters[i].t += dt) > 1.4f) floaters.RemoveAt(i);
            if (toastT > 0) toastT -= dt;
            toastA = Mathf.MoveTowards(toastA, toastT > 0 ? 1 : 0, dt / 0.4f);
            if (bannerT > 0) bannerT -= dt;
            bannerA = Mathf.MoveTowards(bannerA, bannerT > 0 ? 1 : 0, dt / 0.9f);
            if (fadeDur > 0 && fadeT < fadeDur) { fadeT += dt; float k = Mathf.Clamp01(fadeT / fadeDur); fadeA = Mathf.Lerp(fadeFrom, fadeTo, k * k * (3 - 2 * k)); }
            else if (fadeDur <= 0) fadeA = fadeTo;
            Dice.Update(dt);
            Dialogue.typeT += dt;
        }

        // ---------------------------------------------------------------- the frame
        public static void Draw()
        {
            overUI = false;
            float SW = Screen.width, SH = Screen.height;
            bool inGame = G.mode != "title" && G.mode != "create";
            if (inGame && G.party.Count > 0)
            {
                DrawFloaters();
                DrawBanner(SW, SH);
                DrawQuest(SW);
                DrawInitiative(SW);
                DrawParty(SH);
                DrawHotbar(SW, SH);
                DrawLog(SW, SH);
                DrawToast(SW, SH);
            }
            // fades and title cards sit over the world but under the panels
            if (fadeA > 0.001f) Fill(new Rect(0, 0, SW, SH), new Color(fadeColor.r, fadeColor.g, fadeColor.b, fadeA));
            if (cineHtml != null) DrawCine(SW, SH);
            if (inGame && G.party.Count > 0) Corner();
            // the dialogue stays up under the d20, and the hint card sits over both (the DOM order of the web page)
            if (Dialogue.Open) DrawDialogue(SW, SH);
            if (Dice.open) DrawDice(SW, SH);
            Tutorial.Draw(SW, SH);
            Journal.Draw(SW, SH);
            if (G.paused && !Journal.open) DrawPause(SW, SH);
            if (G.mode == "title") DrawTitle(SW, SH);
            if (G.mode == "create") Creator.Draw(SW, SH);
            if (G.mode == "end") DrawEnd(SW, SH);
            if (gameOver) DrawGameOver(SW, SH);
            if (tooltipHtml != null && !G.paused) DrawTooltip(SW, SH);
        }

        static void DrawFloaters()
        {
            foreach (var f in floaters)
            {
                float k = f.t / 1.3f;
                float a = k < 0.12f ? k / 0.12f : k < 0.7f ? 1 : Mathf.Clamp01(1 - (k - 0.7f) / 0.3f);
                float rise = k < 0.12f ? Mathf.Lerp(6, -6, k / 0.12f) : Mathf.Lerp(-6, -46, (k - 0.12f) / 0.88f);
                float sx = (f.x - G.cam.x) * G.scale + f.jx, sy = (f.y - G.cam.y) * G.scale + rise;
                int size = f.cls == "crit" ? 28 : f.cls == "miss" ? 16 : f.cls == "info" ? 15 : 20;
                Color c = f.cls == "crit" ? Gfx.Hex("#ffd84a") : f.cls == "miss" ? Gfx.Hex("#c8c8c8") : f.cls == "heal" ? Gfx.Hex("#8fff7a") : f.cls == "info" ? TEAL : Color.white;
                c.a = a;
                var st = S(size, c, false, TextAnchor.LowerCenter, false, FontStyle.Bold);
                Text(new Rect(sx - 150, sy - 40, 300, 40), f.text, st);
            }
        }

        static void DrawBanner(float SW, float SH)
        {
            if (bannerA <= 0.001f || bannerText == null) return;
            float w = Mathf.Min(720, SW * 0.9f), x = (SW - w) / 2, y = SH * 0.09f;
            var bg = new Color(10 / 255f, 12 / 255f, 18 / 255f, 0.75f * bannerA);
            for (int i = 0; i < 20; i++) { float k = i / 20f; var c = bg; c.a *= Mathf.Min(1, k * 5) * Mathf.Min(1, (1 - k) * 5); Fill(new Rect(x + w * k, y, w / 20 + 1, 76), c); }
            var orn = TEAL; orn.a = bannerA;
            Fill(new Rect(x + w * 0.12f, y + 8, w * 0.76f, 1), orn);
            Fill(new Rect(x + w * 0.12f, y + 66, w * 0.76f, 1), orn);
            var tc = Gfx.Hex("#f4ecdc"); tc.a = bannerA;
            Text(new Rect(x, y + 10, w, 56), bannerText, S(Mathf.Clamp((int)(SW * 0.034f), 26, 46), tc, true, TextAnchor.MiddleCenter, false));
        }

        static void DrawQuest(float SW)
        {
            var qs = Story.Quests(false);
            float y = 14, x = SW - 18 - 290;
            foreach (var q in qs)
            {
                Text(new Rect(x, y, 290, 22), q.title, S(17, GOLD, true, TextAnchor.UpperRight, false, FontStyle.Bold));
                y += 26;
                foreach (var (t, d) in q.objs)
                {
                    var st = S(14, d ? MUTED : TEXT, false, TextAnchor.UpperRight);
                    float h = H(t, st, 270);
                    Text(new Rect(x, y, 270, h), d ? "<color=#a89c86>" + t + "</color>" : t, st);
                    // the diamond
                    var m = new Rect(x + 279, y + 4, 8, 8);
                    var mat = GUI.matrix; GUIUtility.RotateAroundPivot(45, m.center);
                    if (d) Fill(m, GOLD); else Border(m, GOLD, 1.5f);
                    GUI.matrix = mat;
                    y += h + 4;
                }
                y += 8;
            }
        }

        static void DrawInitiative(float SW)
        {
            var C = G.combat;
            if (C == null) return;
            float w = C.order.Count * 52 - 6, x = (SW - w) / 2;
            foreach (var u in C.order)
            {
                bool now = u == C.active;
                var r = new Rect(x, 14 + (now ? 4 : 0), 46, 52);
                if (now) r = new Rect(r.x - 3, r.y - 3, 52, 58);
                Frame(r, PANEL, now ? GOLD : u.team == "party" ? Gfx.Hex("#2a6a8a") : Gfx.Hex("#8a2a2a"));
                var tint = u.hp <= 0 ? new Color(1, 1, 1, 0.25f) : Color.white;
                Pic(new Rect(r.x + 3, r.y + 3, r.width - 6, (r.width - 6) * 24 / 26f), u.portrait, tint);
                Fill(new Rect(r.x + 3, r.yMax - 5, r.width - 6, 3), Gfx.Hex("#300000"));
                Fill(new Rect(r.x + 3, r.yMax - 5, (r.width - 6) * Mathf.Max(0, u.hp) / u.maxHp, 3), HP);
                if (Hover(r)) Tooltip("<b>" + u.name + "</b>");
                x += 52;
            }
        }

        static void DrawParty(float SH)
        {
            float y = SH - 16 - G.party.Count * 62 + 8;
            for (int i = 0; i < G.party.Count; i++)
            {
                var p = G.party[i];
                var r = new Rect(16, y, 290, 54);
                bool active = G.mode == "combat" ? G.combat?.active == p : i == G.leader;
                Frame(r, PANEL, active ? GOLD : EDGE, active ? 2 : 1);
                var pr = new Rect(r.x + 6, r.y + 3, 52, 48);
                Fill(pr, Gfx.Hex("#2a2436")); Border(pr, GOLD_DIM);
                Pic(pr, p.portrait, p.hp <= 0 ? new Color(0.5f, 0.5f, 0.5f, 1) : Color.white);
                float ix = r.x + 66, iw = r.width - 78;
                GUI.Label(new Rect(ix, r.y + 4, iw, 18), p.name, S(14, p.hp <= 0 ? MUTED : TEXT, false, TextAnchor.UpperLeft, false));
                GUI.Label(new Rect(ix, r.y + 5, iw, 18), $"{p.cls} · nv <b>{p.level}</b>", S(11, MUTED, false, TextAnchor.UpperRight, false));
                var hb = new Rect(ix, r.y + 23, iw, 9);
                Fill(hb, Gfx.Hex("#2a1a1a")); Fill(new Rect(hb.x, hb.y, hb.width * Mathf.Max(0, p.hp) / p.maxHp, 9), p.hp <= 0 ? Color.gray : HP); Fill(new Rect(hb.x, hb.y, hb.width * Mathf.Max(0, p.hp) / p.maxHp, 3), new Color(1, 0.54f, 0.29f, 0.6f)); Border(hb, Color.black);
                GUI.Label(new Rect(ix, r.y + 33, iw, 14), $"{Mathf.Max(0, p.hp)} / {p.maxHp} PV", S(11, MUTED, false, TextAnchor.UpperLeft, false));
                GUI.Label(new Rect(ix, r.y + 33, iw, 14), $"CA {p.ac}", S(11, MUTED, false, TextAnchor.UpperRight, false));
                var xb = new Rect(ix, r.y + 47, iw, 4);
                Fill(xb, Gfx.Hex("#1a1a22")); Fill(new Rect(xb.x, xb.y, xb.width * Mathf.Min(1, p.xp / (float)p.nextXp), 4), Gfx.Hex("#d8a83a"));
                if (Click(r)) Game.SelectLeader(i);
                y += 62;
            }
        }

        static void DrawHotbar(float SW, float SH)
        {
            float slotW = 54, gap = 10;
            float econW = hotbarCombat ? 270 : 90;
            float total = hotbar.Count * (slotW + gap) + econW, x = (SW - total) / 2, y = SH - 16 - slotW;
            for (int i = 0; i < hotbar.Count; i++)
            {
                var e = hotbar[i];
                var r = new Rect(x, y, slotW, slotW);
                bool hov = Hover(r);
                var d = new Rect(r.x + 9, r.y + 9, slotW - 18, slotW - 18);
                var mat = GUI.matrix; GUIUtility.RotateAroundPivot(45, d.center);
                Fill(d, hov || e.sel ? Gfx.Hex("#4a301a") : Gfx.Hex("#24180e"));
                Border(d, hov || e.sel ? GOLD : GOLD_DIM, 2);
                GUI.matrix = mat;
                Pic(new Rect(r.x + 14, r.y + 14, 26, 26), Icons.Get(e.icon), e.off ? new Color(0.45f, 0.45f, 0.45f, 1) : Color.white);
                var kr = new Rect(r.x + 20, r.yMax - 6, 14, 14);
                Frame(kr, Gfx.Hex("#0c0a10"), GOLD_DIM);
                GUI.Label(kr, (i + 1).ToString(), S(11, GOLD, false, TextAnchor.MiddleCenter, false));
                if (e.count != null) Text(new Rect(r.xMax - 18, r.y - 4, 20, 16), e.count.ToString(), S(11, Color.white, false, TextAnchor.UpperRight, false));
                if (hov) { Tooltip($"<b>{e.name}</b>\n{Rich.Html(e.desc)}"); overUI = true; }
                if (Click(r) && !e.off) { Snd.click(); e.use(); }
                x += slotW + gap;
            }
            // the economy: gold out of combat; action, bonus and movement in combat
            var C = G.combat;
            if (hotbarCombat && C?.active != null)
            {
                var u = C.active;
                void Pip(float px, float py, bool on, Color c, string label)
                {
                    var pr = new Rect(px, py + 3, 10, 10);
                    var mat = GUI.matrix; GUIUtility.RotateAroundPivot(45, pr.center);
                    Fill(pr, on ? c : Gfx.Hex("#333333")); Border(pr, Color.black);
                    GUI.matrix = mat;
                    GUI.Label(new Rect(px + 16, py, 120, 16), label, S(12, MUTED, false, TextAnchor.UpperLeft, false));
                }
                Pip(x + 10, y + 2, u.action != 0, Gfx.Hex("#6ad04a"), "Ação");
                Pip(x + 10, y + 19, u.bonus != 0, Gfx.Hex("#e89a2a"), "Bônus");
                Pip(x + 10, y + 36, u.moveLeft > 0, Gfx.Hex("#5fb0e8"), "Movimento " + u.moveLeft);
                var br = new Rect(x + 130, y + 8, 130, 40);
                if (Button(br, "Fim do turno", 15)) Combat.EndTurn();
                if (Hover(br)) overUI = true;
            }
            else if (!hotbarCombat && G.mode != "combat")
            {
                Pic(new Rect(x + 8, y + 18, 16, 16), Icons.Get("gold"));
                GUI.Label(new Rect(x + 28, y + 18, 90, 18), $"{G.gold} ouro", S(12, MUTED, false, TextAnchor.UpperLeft, false));
            }
            Block(new Rect((SW - total) / 2, y - 6, total, slotW + 12));
        }

        static void DrawLog(float SW, float SH)
        {
            float x = SW - 18 - 300, y = SH - 96;
            var lines = new List<(string, GUIStyle, float)>();
            float tot = 0;
            for (int i = logLines.Count - 1; i >= 0 && tot < 170; i--)
            {
                var (html, cls) = logLines[i];
                Color c = cls == "hit" ? Gfx.Hex("#ffb070") : cls == "miss" ? Gfx.Hex("#9a9a9a") : cls == "crit" ? Gfx.Hex("#ffd84a") : cls == "heal" ? GOOD : cls == "sys" ? TEAL : Gfx.Hex("#ddd2bc");
                var st = S(13, c);
                float h = H(html, st, 300);
                tot += h + 2;
                lines.Add((html, st, h));
            }
            foreach (var (html, st, h) in lines) { y -= h + 2; if (y < SH - 96 - 170) break; Text(new Rect(x, y, 300, h), html, st); }
        }

        static void DrawToast(float SW, float SH)
        {
            if (toastA <= 0.001f || toastText == null) return;
            var c = GOLD; c.a = toastA;
            Text(new Rect(0, SH * 0.3f, SW, 40), toastText, S(22, c, true, TextAnchor.UpperCenter, false));
        }

        static void DrawTooltip(float SW, float SH)
        {
            var st = S(13, TEXT);
            string s = tooltipHtml.Replace("<b>", "<b><color=#e8c06a>").Replace("</b>", "</color></b>");
            float w = Mathf.Min(260, W(s, S(13, TEXT, false, TextAnchor.UpperLeft, false)) + 4), h = H(s, st, w);
            float x = G.mouseX + 18, y = G.mouseY + 14;
            if (x + w + 20 > SW) x = SW - w - 20; if (y + h + 12 > SH) y = SH - h - 12;
            var r = new Rect(x, y, w + 20, h + 12);
            Frame(r, PANEL, GOLD_DIM);
            GUI.Label(new Rect(x + 10, y + 6, w, h), s, st);
        }

        static void DrawCine(float SW, float SH)
        {
            if (cineCls == "title")
            {
                // #cine h1 / h2: the act card
                var m = System.Text.RegularExpressions.Regex.Match(cineHtml, "<h1>(.*?)</h1><h2>(.*?)</h2>");
                int h1 = Mathf.Clamp((int)(SW * 0.08f), 48, 104), h2 = Mathf.Clamp((int)(SW * 0.024f), 18, 28);
                float y = SH / 2 - (h1 * 1.2f + 8 + h2 * 1.3f) / 2;
                GUI.Label(new Rect(0, y, SW, h1 * 1.2f), m.Groups[1].Value, S(h1, Gfx.Hex("#f4ecdc"), true, TextAnchor.MiddleCenter, false, FontStyle.Bold));
                GUI.Label(new Rect(0, y + h1 * 1.2f + 8, SW, h2 * 1.3f), m.Groups[2].Value, S(h2, GOLD, true, TextAnchor.MiddleCenter, false));
                return;
            }
            // #cine .small: a quiet line in the dark
            GUI.Label(new Rect(SW * 0.1f, 0, SW * 0.8f, SH), Rich.Html(cineHtml), S(18, Gfx.Hex("#8a8276"), false, TextAnchor.MiddleCenter, true, FontStyle.Italic));
        }

        static void Corner()
        {
            float x = 14, y = 12;
            void B(string icon, string tip, Action a)
            {
                var r = new Rect(x, y, 34, 34);
                Frame(r, PANEL, Hover(r) ? GOLD : EDGE, 1, 6);
                Pic(new Rect(r.x + 9, r.y + 9, 16, 16), Icons.Get(icon));
                if (Hover(r)) { Tooltip(tip); overUI = true; }
                if (Click(r)) a();
                x += 40;
            }
            B("menu", "Menu (Esc)", () => Game.SetPaused(!G.paused));
            B("bag", "Bolsa (I)", () => Journal.Toggle("bag"));
            B("book", "Diário (J)", () => Journal.Toggle("quests"));
            B(Snd.muted ? "mute" : "sound", "Som (M)", () => Snd.ToggleMute());
        }

        // ---------------------------------------------------------------- dialogue
        static readonly System.Text.RegularExpressions.Regex ANYTAG = new System.Text.RegularExpressions.Regex("<[^>]+>");
        static void DrawDialogue(float SW, float SH)
        {
            // #dialogue: min(820px, 92vw) wide, 120px off the bottom, padding 16/20, the portrait and the body 16px apart
            float w = Mathf.Min(820, SW * 0.92f), x = (SW - w) / 2;
            bool narr = Dialogue.shownNarr;
            float textX = narr ? x + 20 : x + 20 + 104 + 16, textW = w - (textX - x) - 20;
            var tst = narr ? S(17, Gfx.Hex("#e2d8c4"), false, TextAnchor.UpperLeft, true, FontStyle.Italic) : S(17, TEXT);
            string full = Dialogue.shownText ?? "";
            string plain = ANYTAG.Replace(full, "");
            int shown = (int)(Dialogue.typeT / 0.016f) * 2;
            bool typing = shown < plain.Length;
            string txt = typing ? plain.Substring(0, shown) : full;
            float th = Mathf.Max(50, H(full, tst, textW));
            var opts = Dialogue.shownOpts;
            var ost = S(16, Gfx.Hex("#e8dcc4"));
            float oh = 0;
            foreach (var o in opts) oh += H(o.html, ost, textW - 16) + 8 + 4;
            if (Dialogue.shownInput != null) oh += 44;
            float nameH = narr ? 0 : 24 + 6;
            float bodyH = nameH + th + 12 + oh - 4;
            float h = 16 + Mathf.Max(narr ? 0 : 96, bodyH) + 16;
            float y = SH - 120 - h;
            var r = new Rect(x, y, w, h);
            Fill(new Rect(r.x - 6, r.y + 4, r.width + 12, r.height + 14), new Color(0, 0, 0, 0.25f), 8); // box-shadow
            VGrad(r, new Color(14 / 255f, 12 / 255f, 20 / 255f, 0.94f), new Color(8 / 255f, 8 / 255f, 12 / 255f, 0.96f));
            Border(r, EDGE);
            if (!narr)
            {
                var pr = new Rect(x + 20, y + 16, 104, 96);
                Radial(pr, Gfx.Hex("#3a4a58"), Gfx.Hex("#12161e"), 0.5f, 0.4f);
                Pic(pr, Dialogue.shownSpeaker?.SpPortrait);
                Border(pr, GOLD_DIM);
                GUI.Label(new Rect(textX, y + 16, textW, 24), Dialogue.shownName, S(18, GOLD, true, TextAnchor.UpperLeft, false, FontStyle.Bold));
            }
            var tr = new Rect(textX, y + 16 + nameH, textW, th);
            GUI.Label(tr, txt, tst);
            if (typing && !Dice.open && Click(tr)) Dialogue.typeT = 999;
            float oy = tr.yMax + 12;
            if (Dialogue.shownInput != null)
            {
                var ir = new Rect(textX, oy + 2, Mathf.Min(320, textW), 34);
                Fill(ir, Gfx.Hex("#0e0c14")); Border(ir, GOLD_DIM);
                GUI.SetNextControlName("dlgInput");
                var ist = new GUIStyle(S(16, TEXT, false, TextAnchor.MiddleLeft, false)) { padding = new RectOffset(10, 10, 6, 6) };
                Dialogue.inputValue = GUI.TextField(ir, Dialogue.inputValue ?? "", Dialogue.shownInput.max, ist);
                if (string.IsNullOrEmpty(Dialogue.inputValue)) GUI.Label(new Rect(ir.x + 10, ir.y, ir.width, ir.height), Dialogue.shownInput.placeholder, S(16, MUTED, false, TextAnchor.MiddleLeft, false));
                if (GUI.GetNameOfFocusedControl() != "dlgInput") GUI.FocusControl("dlgInput");
                var e = Event.current;
                if (e.type == EventType.KeyDown && (e.keyCode == KeyCode.Return || e.keyCode == KeyCode.KeypadEnter)) { e.Use(); Dialogue.Choose(0); }
                oy += 44;
            }
            for (int i = 0; i < opts.Count; i++)
            {
                var o = opts[i];
                float ohh = H(o.html, ost, textW - 16);
                var orr = new Rect(textX, oy, textW, ohh + 8);
                bool hov = Hover(orr) && !o.used && !Dice.open;
                if (hov) Fill(orr, new Color(1, 1, 1, 0.063f));
                if (hov) Fill(new Rect(orr.x, orr.y, 2, orr.height), GOLD);
                var st = S(16, o.used ? new Color(0.91f, 0.86f, 0.77f, 0.4f) : hov ? Color.white : Gfx.Hex("#e8dcc4"));
                GUI.Label(new Rect(orr.x + 8, orr.y + 4, textW - 16, ohh), o.html, st);
                if (!Dice.open && Click(orr)) Dialogue.Choose(i);
                oy += ohh + 8 + 4;
            }
            if (!Dice.open) Block(r);
        }

        // the d20 of index.html, rasterized once from the same SVG: viewBox 0..100, outer hexagon, inner triangle, edges
        static readonly Vector2[] D20O = { new Vector2(50, 3), new Vector2(93, 27), new Vector2(93, 73), new Vector2(50, 97), new Vector2(7, 73), new Vector2(7, 27) };
        static readonly Vector2[] D20I = { new Vector2(50, 22), new Vector2(78, 68), new Vector2(22, 68) };
        static readonly Vector2[][] D20L = {
            new[] { new Vector2(50, 3), new Vector2(50, 22) }, new[] { new Vector2(93, 27), new Vector2(78, 68) }, new[] { new Vector2(7, 27), new Vector2(22, 68) },
            new[] { new Vector2(50, 97), new Vector2(78, 68) }, new[] { new Vector2(50, 97), new Vector2(22, 68) }, new[] { new Vector2(93, 73), new Vector2(78, 68) },
            new[] { new Vector2(7, 73), new Vector2(22, 68) }, new[] { new Vector2(93, 27), new Vector2(50, 22) }, new[] { new Vector2(7, 27), new Vector2(50, 22) } };
        static Texture2D d20Tex;
        static Texture2D D20Tex()
        {
            if (d20Tex != null) return d20Tex;
            const int N = 380, SS = 3; // 3.8 px per viewBox unit, 3×3 samples per pixel
            float k = N / 100f;
            Color fillO = Gfx.Hex("#2a2236"), fillI = Gfx.Hex("#3a3050");
            bool Inside(Vector2[] poly, Vector2 p)
            {
                bool c = false;
                for (int i = 0, j = poly.Length - 1; i < poly.Length; j = i++)
                    if ((poly[i].y > p.y) != (poly[j].y > p.y) && p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
                return c;
            }
            float Seg(Vector2 p, Vector2 a, Vector2 b) { var ab = b - a; float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / ab.sqrMagnitude); return Vector2.Distance(p, a + ab * t); }
            bool OnPoly(Vector2[] poly, Vector2 p, float w) { for (int i = 0; i < poly.Length; i++) if (Seg(p, poly[i], poly[(i + 1) % poly.Length]) <= w / 2) return true; return false; }
            Color Sample(Vector2 p)
            {
                // painter's order of the SVG: outer polygon (fill, stroke), inner polygon (fill, stroke), the edge lines
                Color c = new Color(0, 0, 0, 0);
                void Over(Color s) { c = new Color(s.r * s.a + c.r * (1 - s.a), s.g * s.a + c.g * (1 - s.a), s.b * s.a + c.b * (1 - s.a), s.a + c.a * (1 - s.a)); }
                if (Inside(D20O, p)) Over(fillO);
                if (OnPoly(D20O, p, 2)) Over(GOLD);
                if (Inside(D20I, p)) Over(fillI);
                if (OnPoly(D20I, p, 1.5f)) Over(GOLD);
                foreach (var l in D20L) if (Seg(p, l[0], l[1]) <= 0.6f) { Over(GOLD_DIM); break; }
                return c;
            }
            d20Tex = new Texture2D(N, N, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            var px = new Color[N * N];
            for (int y = 0; y < N; y++)
                for (int x = 0; x < N; x++)
                {
                    float r = 0, g = 0, b = 0, a = 0;
                    for (int sy = 0; sy < SS; sy++) for (int sx = 0; sx < SS; sx++)
                        {
                            var c = Sample(new Vector2((x + (sx + 0.5f) / SS) / k, (y + (sy + 0.5f) / SS) / k));
                            r += c.r; g += c.g; b += c.b; a += c.a; // premultiplied
                        }
                    float n = SS * SS;
                    px[(N - 1 - y) * N + x] = a > 0 ? new Color(r / a, g / a, b / a, a / n) : new Color(0, 0, 0, 0);
                }
            d20Tex.SetPixels(px); d20Tex.Apply();
            return d20Tex;
        }

        static void DrawDice(float SW, float SH)
        {
            var full = new Rect(0, 0, SW, SH);
            Radial(full, new Color(10 / 255f, 8 / 255f, 16 / 255f, 0.9f), new Color(0, 0, 0, 0.97f));
            float cy = SH / 2;
            // a centred column, gap 10: skill, DC, the 190 px die (centred on the screen), result, extra, hint
            Text(new Rect(0, cy - 163 - 22, SW, 44), Dice.skillLine, S(30, GOLD, true, TextAnchor.MiddleCenter, false), false);
            GUI.Label(new Rect(0, cy - 120 - 13, SW, 26), Dice.dcLine, S(18, MUTED, false, TextAnchor.MiddleCenter, false));
            var c = new Vector2(SW / 2, cy);
            var mat = GUI.matrix;
            // the SVG spins (0.3 s a turn) while the number keeps still
            if (Dice.spinning) GUIUtility.RotateAroundPivot(Time.unscaledTime * 1200 % 360, c);
            GUI.DrawTexture(new Rect(c.x - 95, c.y - 95, 190, 190), D20Tex(), ScaleMode.StretchToFill, true);
            GUI.matrix = mat;
            Text(new Rect(0, cy + 9 - 30, SW, 60), Dice.shownNum.ToString(), S(46, Color.white, false, TextAnchor.MiddleCenter, false, FontStyle.Bold));
            if (!string.IsNullOrEmpty(Dice.resultText)) Text(new Rect(0, cy + 122 - 23, SW, 46), Dice.resultText, S(34, Dice.resultOk ? GOOD : BAD, true, TextAnchor.MiddleCenter, false), false);
            float hintY = cy + 174;
            if (Dice.lampejoOffer)
            {
                string label = "Lampejo de Velmoor: rolar de novo";
                var st = S(16, Gfx.Hex("#d8e8ff"), true, TextAnchor.MiddleLeft, false, FontStyle.Bold);
                float w = W(label, st) + 36 + 26, h = 38;
                var br = new Rect(SW / 2 - w / 2, cy + 150, w, h);
                bool hov = Hover(br);
                Fill(new Rect(br.x - 4, br.y - 4, br.width + 8, br.height + 8), new Color(0.42f, 0.54f, 0.82f, 0.12f), 6);
                VGrad(br, Gfx.Hex("#24304a"), Gfx.Hex("#141a2a"));
                Border(br, hov ? Gfx.Hex("#c8dcff") : Gfx.Hex("#8aa8e0"));
                Pic(new Rect(br.x + 18, br.y + 11, 16, 16), Icons.Get("leaf"));
                GUI.Label(new Rect(br.x + 40, br.y, w - 40, h), label, hov ? S(16, Color.white, true, TextAnchor.MiddleLeft, false, FontStyle.Bold) : st);
                if (Click(br)) Dice.UseLampejo();
                hintY += h + 16;
            }
            GUI.Label(new Rect(0, hintY - 9, SW, 18), "clique para continuar", S(13, MUTED, false, TextAnchor.MiddleCenter, false));
            if (Click(full)) Dice.Click();
        }
        /// <summary>A line segment for the GUI (a thin rotated rectangle).</summary>
        public static void GLine(Vector2 a, Vector2 b, Color c, float w)
        {
            var d = b - a; float len = d.magnitude; if (len < 0.01f) return;
            float ang = Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg;
            var mat = GUI.matrix;
            GUIUtility.RotateAroundPivot(ang, a);
            Fill(new Rect(a.x, a.y - w / 2, len, w), c);
            GUI.matrix = mat;
        }

        // ---------------------------------------------------------------- pause menu
        static Vector2 pauseScroll;
        static void DrawPause(float SW, float SH)
        {
            Fill(new Rect(0, 0, SW, SH), new Color(5 / 255f, 5 / 255f, 8 / 255f, 0.72f));
            float w = Mathf.Min(560, SW - 32), h = Mathf.Min(SH - 32, 640), x = (SW - w) / 2, y = (SH - h) / 2;
            var r = new Rect(x, y, w, h);
            Fill(r, new Color(16 / 255f, 14 / 255f, 20 / 255f, 0.98f)); Border(r, EDGE);
            GUILayout.BeginArea(new Rect(x + 28, y + 22, w - 56, h - 44));
            pauseScroll = GUILayout.BeginScrollView(pauseScroll);
            GUILayout.Label("PAUSADO", S(34, GOLD, true, TextAnchor.MiddleCenter, false));
            Section("Som");
            bool m = GUILayout.Toggle(Snd.muted, "  Silenciar tudo   <color=#a89c86>[M]</color>", S(15, TEXT));
            if (m != Snd.muted) Snd.SetMuted(m);
            bool sfxHeader = false;
            foreach (var g in Snd.SOUND_GROUPS)
            {
                if (g.sfx && !sfxHeader) { GUILayout.Space(8); GUILayout.Label("EFEITOS SONOROS", S(12, MUTED)); sfxHeader = true; }
                GUILayout.BeginHorizontal();
                float v = Snd.vol[g.key];
                GUILayout.Label(g.label, S(14, v == 0 ? MUTED : TEXT), GUILayout.Width(w - 56 - 220));
                float nv = GUILayout.HorizontalSlider(v, 0, 1, GUILayout.Width(150));
                nv = Mathf.Round(nv * 20) / 20;
                GUILayout.Label(Mathf.RoundToInt(nv * 100) + "%", S(14, MUTED, false, TextAnchor.UpperRight), GUILayout.Width(46));
                GUILayout.EndHorizontal();
                if (nv != v) { Snd.SetVolume(g.key, nv); previewKey = g.key; }
            }
            if (previewKey != null && Event.current.type == EventType.MouseUp) { Snd.PreviewSound(previewKey); previewKey = null; }
            Section("Jogo");
            bool t = GUILayout.Toggle(G.tutorial, "  Dicas do tutorial", S(15, TEXT));
            if (t != G.tutorial) Tutorial.SetTutorial(t);
            Section("Controles");
            foreach (var line in new[] {
                "<b><color=#efe6d2>Clique</color></b> ou <b><color=#efe6d2>WASD</color></b> anda · <b><color=#efe6d2>E</color></b> interage · <b><color=#efe6d2>Tab</color></b> troca de personagem",
                "<b><color=#efe6d2>I</color></b> abre a Bolsa · <b><color=#efe6d2>J</color></b> abre o Diário (missões e lembranças)",
                "Combate: <b><color=#efe6d2>1–5</color></b> ação · <b><color=#efe6d2>Espaço</color></b> encerra o turno · <b><color=#efe6d2>Esc</color></b> cancela a ação",
                "<b><color=#efe6d2>Esc</color></b> ou <b><color=#efe6d2>P</color></b> pausa · <b><color=#efe6d2>M</color></b> liga/desliga o som" })
                GUILayout.Label("• " + line, S(13, MUTED));
            GUILayout.Space(16);
            GUILayout.BeginHorizontal(); GUILayout.FlexibleSpace();
            var br = GUILayoutUtility.GetRect(180, 44);
            if (Button(br, "Continuar", 18)) Game.SetPaused(false);
            GUILayout.FlexibleSpace(); GUILayout.EndHorizontal();
            GUILayout.EndScrollView();
            GUILayout.EndArea();
            Block(new Rect(0, 0, SW, SH));
        }
        static string previewKey;
        static void Section(string t)
        {
            GUILayout.Space(14);
            GUILayout.Label(t, S(16, GOLD, true, TextAnchor.UpperLeft, false));
            var r = GUILayoutUtility.GetRect(10, 1, GUILayout.ExpandWidth(true));
            Fill(r, new Color(0.42f, 0.35f, 0.23f, 0.4f));
            GUILayout.Space(6);
        }

        // ---------------------------------------------------------------- title, end, game over
        static void DrawTitle(float SW, float SH)
        {
            // #title: the valley shows through a radial dusk; the box is centred
            Radial(new Rect(0, 0, SW, SH), new Color(20 / 255f, 30 / 255f, 28 / 255f, 0.55f), new Color(5 / 255f, 5 / 255f, 8 / 255f, 0.92f), 0.5f, 0.4f);
            int h1 = Mathf.Clamp((int)(SW * 0.07f), 44, 92);
            var help = new[] {
                "<color=#e8c06a>Clique</color> no chão para andar · <color=#e8c06a>WASD</color> também anda",
                "<color=#e8c06a>Clique</color> em personagens e baús para interagir · <color=#e8c06a>E</color> interage com o que está perto",
                "Em combate: <color=#e8c06a>clique</color> num quadrado para mover, <color=#e8c06a>1–5</color> escolhe a ação, <color=#e8c06a>Espaço</color> encerra o turno",
                "<color=#e8c06a>Tab</color> alterna o personagem controlado · <color=#e8c06a>Esc</color> pausa e abre o som · <color=#e8c06a>M</color> liga/desliga o som" };
            float total = h1 * 1.25f + 4 + 22 + 26 + (Game.loaded ? help.Length * 30.4f + 18 + 54 : 20);
            float y = (SH - total) / 2;
            var hst = S(h1, Gfx.Hex("#f4ecdc"), true, TextAnchor.MiddleCenter, false, FontStyle.Bold);
            var glow = new Color(95 / 255f, 208 / 255f, 200 / 255f, 0.12f);
            GUI.Label(new Rect(0, y, SW, h1 * 1.25f), "<color=#000000>Brumafolha</color>", new GUIStyle(hst) { contentOffset = new Vector2(0, 4) });
            GUI.Label(new Rect(0, y, SW, h1 * 1.25f), "Brumafolha", hst);
            y += h1 * 1.25f + 4;
            GUI.Label(new Rect(0, y, SW, 22), "Um protótipo de RPG tático", S(18, TEAL, false, TextAnchor.MiddleCenter, false));
            y += 22 + 26;
            if (!Game.loaded) { GUI.Label(new Rect(0, y, SW, 20), "Pintando o vale pixel a pixel…", S(16, MUTED, false, TextAnchor.MiddleCenter, false)); return; }
            foreach (var l in help) { Text(new Rect(0, y, SW, 30.4f), l, S(16, Gfx.Hex("#d8ccb4"), false, TextAnchor.MiddleCenter, false)); y += 30.4f; }
            var bst = S(22, GOLD, true, TextAnchor.MiddleCenter, false, FontStyle.Bold);
            float bw = W("Começar", bst) + 88;
            if (BigButton(new Rect(SW / 2 - bw / 2, y + 18, bw, 54), "Começar", 22)) Game.Create();
        }

        /// <summary>The gold-bordered Cinzel buttons (#start, #resume, the creator's "go", the tutorial and end screens).</summary>
        public static bool BigButton(Rect r, string label, int size, bool muted = false)
        {
            bool hov = Hover(r);
            if (muted) Fill(r, Gfx.Hex("#16141c")); else VGrad(r, Gfx.Hex("#5a3a1a"), Gfx.Hex("#2a1a0e"));
            Border(r, muted ? EDGE : GOLD, 2);
            GUI.Label(r, label, S(size, hov ? Color.white : muted ? MUTED : GOLD, true, TextAnchor.MiddleCenter, false, FontStyle.Bold));
            bool c = Click(r);
            if (c) Snd.click();
            return c;
        }

        public static List<(string a, string b)> endRows; public static List<string> endMems; static Vector2 endScroll;
        static void DrawEnd(float SW, float SH)
        {
            Fill(new Rect(0, 0, SW, SH), new Color(5 / 255f, 5 / 255f, 8 / 255f, 0.86f));
            float w = Mathf.Min(680, SW - 40), h = SH - 60, x = (SW - w) / 2, y = 30;
            var r = new Rect(x, y, w, h);
            Fill(r, new Color(16 / 255f, 14 / 255f, 20 / 255f, 0.97f)); Border(r, EDGE);
            GUILayout.BeginArea(new Rect(x + 30, y + 24, w - 60, h - 48));
            endScroll = GUILayout.BeginScrollView(endScroll);
            GUILayout.Label("Fim do Prólogo", S(40, GOLD, true, TextAnchor.MiddleCenter, false));
            GUILayout.Label("A Bruma de Brumafolha", S(20, TEAL, false, TextAnchor.MiddleCenter, false));
            GUILayout.Space(14);
            GUILayout.Label("O que o vale vai lembrar", S(18, GOLD, true));
            foreach (var (a, b) in endRows ?? new List<(string, string)>())
            {
                GUILayout.Label(a, S(15, GOLD));
                GUILayout.Label(b, S(15, TEXT));
                GUILayout.Space(4);
            }
            if (endMems != null && endMems.Count > 0)
            {
                GUILayout.Space(10);
                GUILayout.Label("Quem você é", S(18, GOLD, true));
                foreach (var m in endMems) GUILayout.Label("• " + m, S(15, TEXT));
            }
            GUILayout.Space(10);
            GUILayout.Label($"Nível {G.hero?.level} · {G.gold} peças de ouro", S(14, MUTED, false, TextAnchor.MiddleCenter));
            GUILayout.Space(14);
            GUILayout.BeginHorizontal(); GUILayout.FlexibleSpace();
            if (Button(GUILayoutUtility.GetRect(200, 44), "Jogar de novo", 18)) Game.Restart();
            GUILayout.FlexibleSpace(); GUILayout.EndHorizontal();
            GUILayout.EndScrollView();
            GUILayout.EndArea();
            Block(new Rect(0, 0, SW, SH));
        }

        public static bool gameOver, canRetry;
        static void DrawGameOver(float SW, float SH)
        {
            Fill(new Rect(0, 0, SW, SH), new Color(0, 0, 0, 0.8f));
            float cy = SH / 2;
            Text(new Rect(0, cy - 90, SW, 70), "O grupo caiu", S(54, Gfx.Hex("#ff6a5a"), true, TextAnchor.MiddleCenter, false));
            Text(new Rect(0, cy - 14, SW, 24), "As brumas do vale guardam mais um segredo.", S(16, MUTED, false, TextAnchor.MiddleCenter, false));
            float bw = canRetry ? 460 : 220, bx = (SW - bw) / 2;
            if (canRetry && Button(new Rect(bx, cy + 30, 230, 44), "Tentar a luta de novo", 16)) { gameOver = false; Game.Retry(); }
            if (Button(new Rect(bx + (canRetry ? 240 : 0), cy + 30, 220, 44), "Recomeçar do início", 16)) { gameOver = false; Game.Restart(); }
            Block(new Rect(0, 0, SW, SH));
        }
    }
}
