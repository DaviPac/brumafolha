// Little 16×16 pixel icons, painted in code like everything else. The web UI used emoji; Unity's fonts don't draw
// them, so each emoji the game used has a hand-made stand-in here, keyed by name.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Brumafolha
{
    public static class Icons
    {
        static readonly Dictionary<string, Img> cache = new Dictionary<string, Img>();
        static readonly Col INK = new Col(18, 14, 22);

        public static Img Get(string key)
        {
            if (key == null) return null;
            if (cache.TryGetValue(key, out var img)) return img;
            // the web version's emoji, rendered from the same Noto Color Emoji font into Resources/Emoji
            var tex = Resources.Load<Texture2D>("Emoji/" + key);
            if (tex != null) return cache[key] = new Img { tex = tex, x = 0, y = 0, w = tex.width, h = tex.height };
            var pb = new PixBuf(16, 16);
            Paint(pb, key);
            pb.Outline(INK);
            return cache[key] = pb.ToImg();
        }

        static Col C(string h) => Col.Hex(h);
        static void Line(PixBuf pb, double x0, double y0, double x1, double y1, Col c, int w = 1)
        {
            int n = (int)Math.Max(1, Math.Max(Math.Abs(x1 - x0), Math.Abs(y1 - y0)));
            for (int i = 0; i <= n; i++)
            {
                double x = Math.Round(x0 + (x1 - x0) * i / n), y = Math.Round(y0 + (y1 - y0) * i / n);
                for (int k = 0; k < w; k++) pb.Set(x + k, y, c);
            }
        }
        static void Disc(PixBuf pb, double cx, double cy, double r, Col c, Col? hi = null)
        {
            for (int y = -(int)Math.Ceiling(r); y <= r; y++) for (int x = -(int)Math.Ceiling(r); x <= r; x++)
                    if (x * x + y * y <= r * r + 0.3) pb.Set(cx + x, cy + y, hi.HasValue && x + y < -r * 0.5 ? hi.Value : c);
        }
        static void Rect(PixBuf pb, int x, int y, int w, int h, Col c) => pb.Rect(x, y, w, h, c);

        static readonly Col STEEL = C("#c8d2e0"), STEELD = C("#6e7a90"), GOLDC = C("#f0c040"), GOLDD = C("#a87a1a"), WOODC = C("#9a6236"), WOODD = C("#5a3420");
        static readonly Col RED = C("#e04a3a"), REDD = C("#8a1e1a"), GREEN = C("#6ad04a"), GREEND = C("#2a7a2a"), BLUE = C("#5ab0ff"), PURP = C("#b070ff"), WHITE = C("#f4f0e8"), FIRE1 = C("#ffd060"), FIRE2 = C("#ff7a2a");

        static void Paint(PixBuf pb, string k)
        {
            switch (k)
            {
                case "sword": Line(pb, 3, 12, 12, 3, STEEL, 2); Line(pb, 2, 10, 6, 14, GOLDC); Line(pb, 1, 13, 3, 15, WOODD, 2); break;
                case "dagger": Line(pb, 5, 11, 11, 5, STEEL, 2); Line(pb, 4, 9, 7, 12, GOLDC); Line(pb, 3, 12, 4, 13, WOODD, 2); break;
                case "axe": Line(pb, 4, 14, 10, 3, WOODC, 2); Disc(pb, 11, 5, 3.4, STEEL, WHITE); break;
                case "hammer": Line(pb, 4, 14, 9, 5, WOODC, 2); Rect(pb, 6, 2, 8, 5, STEEL); break;
                case "spear": Line(pb, 3, 14, 11, 4, WOODC, 2); Line(pb, 11, 4, 14, 1, STEEL, 2); break;
                case "staff": Line(pb, 4, 15, 9, 5, WOODC, 2); Disc(pb, 10, 4, 2.6, BLUE, WHITE); break;
                case "bow": for (int y = 2; y <= 13; y++) pb.Set(4 + Math.Round(Math.Sin((y - 2) / 11.0 * Math.PI) * 4), y, WOODC); Line(pb, 4, 2, 4, 13, WHITE); Line(pb, 2, 8, 12, 8, STEELD); Line(pb, 12, 8, 13, 7, STEEL); break;
                case "armor": Rect(pb, 4, 3, 8, 10, STEELD); Rect(pb, 5, 4, 6, 8, STEEL); Rect(pb, 2, 3, 3, 4, STEELD); Rect(pb, 11, 3, 3, 4, STEELD); Line(pb, 8, 4, 8, 11, STEELD); break;
                case "shield": for (int y = 2; y < 14; y++) { int hw = y < 9 ? 5 : 5 - (y - 8); for (int x = -hw; x <= hw; x++) pb.Set(8 + x, y, Math.Abs(x) >= hw - 0 ? STEELD : C("#844c24")); } Disc(pb, 8, 7, 1.2, STEEL); break;
                case "spin": for (int i = 0; i < 26; i++) { double a = i / 26.0 * Math.PI * 1.8, r = 2 + i * 0.22; pb.Set(8 + Math.Cos(a) * r, 8 + Math.Sin(a) * r, i > 18 ? WHITE : STEEL); } break;
                case "wind": Line(pb, 2, 5, 11, 5, WHITE); Line(pb, 11, 5, 12, 3, WHITE); Line(pb, 3, 9, 13, 9, C("#bfe8ff")); Line(pb, 13, 9, 14, 11, C("#bfe8ff")); Line(pb, 2, 12, 8, 12, WHITE); break;
                case "fire": for (int y = 3; y < 15; y++) { double hw = Math.Sin((y - 3) / 12.0 * Math.PI * 0.9) * 4.5; for (double x = -hw; x <= hw; x++) pb.Set(8 + x, y, Math.Abs(x) < hw * 0.45 && y > 7 ? FIRE1 : y < 6 ? FIRE1 : FIRE2); } pb.Set(8, 2, FIRE1); break;
                case "sparkle": Line(pb, 8, 1, 8, 15, C("#ecc8ff")); Line(pb, 1, 8, 15, 8, C("#ecc8ff")); Disc(pb, 8, 8, 2, WHITE); pb.Set(4, 4, PURP); pb.Set(12, 12, PURP); pb.Set(12, 4, PURP); pb.Set(4, 12, PURP); break;
                case "heart": Disc(pb, 5, 6, 3, GREEN, C("#bfffb0")); Disc(pb, 11, 6, 3, GREEN, C("#bfffb0")); for (int y = 7; y < 14; y++) { int hw = 6 - (y - 7); for (int x = -hw; x <= hw; x++) pb.Set(8 + x, y, GREEN); } break;
                case "sun": Disc(pb, 8, 8, 3.5, FIRE1, WHITE); for (int i = 0; i < 8; i++) { double a = i * Math.PI / 4; Line(pb, 8 + Math.Cos(a) * 5, 8 + Math.Sin(a) * 5, 8 + Math.Cos(a) * 7, 8 + Math.Sin(a) * 7, GOLDC); } break;
                case "dove": Disc(pb, 7, 9, 3.2, WHITE); Disc(pb, 11, 6, 1.8, WHITE); pb.Set(13, 6, GOLDC); Line(pb, 4, 6, 8, 3, C("#d8e0ea"), 2); Line(pb, 3, 11, 1, 13, C("#d8e0ea")); break;
                case "boot": Rect(pb, 5, 2, 5, 9, C("#8a5a34")); Rect(pb, 5, 10, 9, 4, C("#6a4024")); Rect(pb, 5, 13, 9, 1, WOODD); break;
                case "target": Disc(pb, 8, 8, 6, RED); Disc(pb, 8, 8, 4, WHITE); Disc(pb, 8, 8, 2, RED); break;
                case "potion": Rect(pb, 7, 1, 3, 3, C("#c8a070")); Rect(pb, 6, 4, 5, 2, C("#b8d8e8")); Disc(pb, 8, 10, 4.4, C("#d83a5a"), C("#ff9ab0")); break;
                case "rage": Disc(pb, 8, 8, 6, C("#e8a02a"), C("#ffd060")); Line(pb, 4, 6, 7, 7, INK); Line(pb, 9, 7, 12, 6, INK); Line(pb, 5, 11, 11, 11, INK); break;
                case "bolt": Line(pb, 10, 1, 5, 8, FIRE1, 2); Line(pb, 5, 8, 11, 8, FIRE1, 2); Line(pb, 11, 8, 6, 15, FIRE1, 2); break;
                case "hands": Disc(pb, 5, 9, 3.5, C("#e8b48a")); Disc(pb, 11, 9, 3.5, C("#e8b48a")); Disc(pb, 8, 4, 1.6, C("#fff09a")); break;
                case "mask": Disc(pb, 8, 8, 6, WHITE); Disc(pb, 5, 7, 1.2, INK); Disc(pb, 11, 7, 1.2, INK); Line(pb, 5, 11, 11, 11, INK); pb.Set(4, 10, INK); pb.Set(12, 10, INK); break;
                case "note": Line(pb, 10, 2, 10, 11, WHITE); Line(pb, 10, 2, 14, 4, WHITE); Disc(pb, 7, 12, 2.6, C("#f0c040")); break;
                case "orb": Disc(pb, 8, 8, 6, PURP, C("#ecc8ff")); Disc(pb, 6, 6, 1.2, WHITE); break;
                case "eye": for (int x = -6; x <= 6; x++) { int h = (int)Math.Round(Math.Sqrt(36 - x * x) * 0.6); for (int y = -h; y <= h; y++) pb.Set(8 + x, 8 + y, WHITE); } Disc(pb, 8, 8, 2.5, PURP); Disc(pb, 8, 8, 1, INK); break;
                case "vine": for (int y = 1; y < 15; y++) pb.Set(8 + Math.Round(Math.Sin(y * 0.8) * 3), y, GREEND); for (int i = 3; i < 14; i += 4) Disc(pb, 8 + Math.Round(Math.Sin(i * 0.8) * 3) + 2, i, 1.6, GREEN); break;
                case "fist": Rect(pb, 4, 5, 8, 7, C("#e8b48a")); for (int i = 0; i < 4; i++) pb.Set(5 + i * 2, 5, C("#b88060")); Rect(pb, 3, 7, 2, 4, C("#d8a07a")); Rect(pb, 5, 12, 6, 3, C("#c47e5e")); break;
                case "leaf": for (int y = 2; y < 15; y++) { double kk = (y - 2) / 12.0, hw = Math.Sin(kk * Math.PI) * 4.5; for (double x = -hw; x <= hw; x++) pb.Set(8 + x, y, C("#c8e0ff")); } Line(pb, 8, 2, 8, 15, C("#7aa8e0")); break;
                case "swap": Line(pb, 3, 5, 12, 5, WHITE); Line(pb, 10, 3, 12, 5, WHITE); Line(pb, 10, 7, 12, 5, WHITE); Line(pb, 4, 11, 13, 11, GOLDC); Line(pb, 4, 11, 6, 9, GOLDC); Line(pb, 4, 11, 6, 13, GOLDC); break;
                case "bag": Disc(pb, 8, 10, 5, C("#8a5a34"), C("#b07a48")); Rect(pb, 6, 3, 4, 3, C("#6a4024")); Line(pb, 5, 6, 11, 6, GOLDC); break;
                case "book": Rect(pb, 3, 3, 10, 11, C("#6a2a2a")); Rect(pb, 4, 4, 8, 9, C("#8a3a34")); Rect(pb, 12, 4, 1, 10, WHITE); Disc(pb, 8, 8, 1.6, GOLDC); break;
                case "gold": Disc(pb, 8, 8, 5.5, GOLDC, C("#fff09a")); Disc(pb, 8, 8, 3, GOLDD); break;
                case "letter": Rect(pb, 2, 4, 12, 9, C("#e8dcc0")); Line(pb, 2, 4, 8, 9, C("#a89878")); Line(pb, 13, 4, 8, 9, C("#a89878")); Disc(pb, 8, 9, 1.5, RED); break;
                case "net": for (int y = 2; y < 15; y += 3) Line(pb, 2, y, 14, y, C("#aa8c54")); for (int x = 2; x < 15; x += 3) Line(pb, x, 2, x, 14, C("#86683c")); break;
                case "chair": Line(pb, 11, 2, 11, 12, WOODC, 2); Line(pb, 4, 9, 12, 9, WOODC, 2); Line(pb, 5, 9, 5, 13, WOODC); for (int x = 2; x < 15; x++) pb.Set(x, 14 - Math.Round(Math.Pow((x - 8) / 6.0, 2) * 2), WOODD); break;
                case "menu": Rect(pb, 3, 4, 10, 2, WHITE); Rect(pb, 3, 7, 10, 2, WHITE); Rect(pb, 3, 10, 10, 2, WHITE); break;
                case "sound": Rect(pb, 2, 6, 3, 4, WHITE); for (int y = 3; y <= 12; y++) { int hw = 4 - Math.Abs(y - 8) / 2; Line(pb, 5, y, 5 + Math.Min(3, 7 - Math.Abs(y - 8)), y, WHITE); } for (int y = 4; y <= 11; y++) pb.Set(12 + Math.Round(Math.Sin((y - 4) / 7.0 * Math.PI) * 1.5), y, C("#9ad0ff")); break;
                case "mute": Rect(pb, 2, 6, 3, 4, WHITE); for (int y = 3; y <= 12; y++) Line(pb, 5, y, 5 + Math.Min(3, 7 - Math.Abs(y - 8)), y, WHITE); Line(pb, 10, 5, 14, 11, RED); Line(pb, 14, 5, 10, 11, RED); break;
                case "dice": Rect(pb, 3, 3, 10, 10, WHITE); Disc(pb, 5, 5, 0.8, INK); Disc(pb, 8, 8, 0.8, INK); Disc(pb, 11, 11, 0.8, INK); break;
                default: Disc(pb, 8, 8, 5, GOLDC); break;
            }
        }
    }

    /// <summary>The HTML the story and the UI wrote, turned into Unity's rich text.</summary>
    public static class Rich
    {
        static readonly System.Text.RegularExpressions.Regex TAG = new System.Text.RegularExpressions.Regex(@"<(/?)([a-zA-Z0-9]+)([^>]*)>");
        static readonly Dictionary<string, string> CLASS_COLOR = new Dictionary<string, string> {
            ["chk"] = "#e8a84a", ["tag"] = "#5fd0c8", ["muted"] = "#a89c86", ["small"] = "#d8ccb4", ["up"] = "#8fd65a", ["down"] = "#ff6a5a", ["warn"] = "#e8a84a", ["sig"] = "#a89c86",
        };
        public static string Html(string s)
        {
            if (string.IsNullOrEmpty(s)) return s ?? "";
            var stack = new Stack<string>();
            string r = TAG.Replace(s, m =>
            {
                bool close = m.Groups[1].Value == "/"; string tag = m.Groups[2].Value.ToLower(), attrs = m.Groups[3].Value;
                if (tag == "br") return "\n";
                if (close)
                {
                    string end = stack.Count > 0 ? stack.Pop() : "";
                    return end + (tag == "p" || tag == "h1" || tag == "h2" || tag == "li" ? "\n" : "");
                }
                string open = "", closeTag = "";
                if (tag == "b" || tag == "strong") { open = "<b>"; closeTag = "</b>"; }
                else if (tag == "i" || tag == "em") { open = "<i>"; closeTag = "</i>"; }
                else if (tag == "h1") { open = "<size=46><b>"; closeTag = "</b></size>"; }
                else if (tag == "h2") { open = "<size=24><color=#5fd0c8>"; closeTag = "</color></size>"; }
                else if (tag == "li") { open = "• "; }
                var cm = System.Text.RegularExpressions.Regex.Match(attrs, @"class=['""]([^'""]+)['""]");
                var sm = System.Text.RegularExpressions.Regex.Match(attrs, @"color:\s*(#[0-9a-fA-F]{3,6})");
                if (sm.Success) { open += $"<color={sm.Groups[1].Value}>"; closeTag = "</color>" + closeTag; }
                else if (cm.Success)
                {
                    foreach (var c in cm.Groups[1].Value.Split(' '))
                        if (CLASS_COLOR.TryGetValue(c, out var col)) { open += $"<color={col}>"; closeTag = "</color>" + closeTag; break; }
                    if (cm.Groups[1].Value.Contains("sig")) { open += "<i>"; closeTag = "</i>" + closeTag; }
                }
                stack.Push(closeTag);
                return open;
            });
            return r.Replace("&nbsp;", " ").Replace("&amp;", "&").Replace("&lt;", "<").Replace("&gt;", ">").Trim('\n');
        }
    }
}
