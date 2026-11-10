// Characters, built from parts at the pixel level: 4 facings, a 4-frame walk, an attack and a cast pose.
// Seen from high up and in front (3/4 top-down), big heads, lit from the top left, outlined dark.
// Ported line by line from src/art/chars.js.
using System;
using System.Collections.Generic;

namespace Brumafolha
{
    /// <summary>Everything the sprite generator needs to draw someone.</summary>
    public class Spec
    {
        public Col[] skin, hair, tunic, pants, boots, cape, orb, trim, apron;
        public string hairStyle = "short", weapon = "none", ears = "human", beard, shield;
        public Col? eyes;
        public bool robe, small, bones, big, faceless, femme, stout, horns, tusks, armor, studs, fur, twoHand, sheathed;
        public bool? blush;
        public int wlen;
        public Spec Clone() => (Spec)MemberwiseClone();
    }

    /// <summary>One character's frames: [dir][frame], frames 0..3 walk, 4 idle, 5 attack, 6 cast. `flash` is the white hit silhouette.</summary>
    public class CharSheet
    {
        public Img[][] frames, flash;
        public PixBuf[][] bufs;
        public CharSheet sheathed;
    }

    public static class Chars
    {
        public const int SW = 26, SH = 36; // sprite cell; feet at (13, 34)
        static readonly Col INK = new Col(22, 16, 28);
        static readonly Col[] METAL = U.Ramp("#3a4250", "#6e7a90", "#aab6c8", "#eef4ff");
        static readonly Col[] GOLD = U.Ramp("#6a4410", "#c48a1c", "#f4d050");
        static readonly Col[] WOOD = U.Ramp("#3a2014", "#6a4026", "#9a6236");
        static readonly Col[] HORN = U.Ramp("#2a1e22", "#5a4044", "#8a7068", "#c8b4a0");
        static readonly Col[] BOWWOOD = U.Ramp("#4a2a14", "#7a4a22", "#b07a3a");
        static readonly Col[] ORB_SKY = U.Ramp("#2a6a8a", "#5ad0ff", "#d0f8ff");

        static Col C(int r, int g, int b) => new Col(r, g, b);
        /// <summary>JavaScript's Math.round (halves go up).</summary>
        static double JR(double v) => Math.Floor(v + 0.5);
        static double FL(double v) => Math.Floor(v);
        static double CE(double v) => Math.Ceiling(v);

        public static readonly Dictionary<string, Spec> SPECS = new Dictionary<string, Spec>
        {
            ["hero"] = new Spec {
                skin = U.Ramp("#8a4e3a", "#c47e5e", "#eab08a", "#f8d0b0"), hair = U.Ramp("#2a1610", "#4a2a1a", "#6e4026", "#90582e"), hairStyle = "short",
                tunic = U.Ramp("#3e1e1a", "#6a2e22", "#94442a", "#b8623a"), pants = U.Ramp("#1e1e2a", "#2e3040", "#43465a"), boots = U.Ramp("#1a1010", "#3a2218", "#5a3622"),
                cape = U.Ramp("#16301e", "#244a2a", "#36663a", "#4c8248"), weapon = "sword", ears = "human", eyes = C(20, 14, 20) },
            ["mage"] = new Spec {
                skin = U.Ramp("#9a6a5a", "#d8a088", "#f4cdb0", "#ffe6d0"), hair = U.Ramp("#3e3a6a", "#6a68a0", "#a0a2d4", "#dcdef6"), hairStyle = "long",
                tunic = U.Ramp("#1e1438", "#34205e", "#4e3288", "#6e4cb0"), pants = U.Ramp("#1e1438", "#34205e", "#4e3288"), boots = U.Ramp("#140c1e", "#24183a", "#38264e"),
                robe = true, weapon = "staff", orb = U.Ramp("#2a6a8a", "#5ad0ff", "#d0f8ff"), ears = "elf", eyes = C(40, 90, 120), trim = GOLD },
            ["maren"] = new Spec {
                skin = U.Ramp("#8a5a44", "#c48868", "#e8b490", "#f8d4b4"), hair = U.Ramp("#5a5a60", "#8a8a90", "#b8b8bc", "#e0e0e2"), hairStyle = "bun",
                tunic = U.Ramp("#18283e", "#22405e", "#2e5a80", "#4278a0"), pants = U.Ramp("#18283e", "#22405e", "#2e5a80"), boots = U.Ramp("#1a1010", "#3a2218", "#5a3622"),
                robe = true, apron = U.Ramp("#8a7a5a", "#c8b890", "#ece0c0"), weapon = "none", ears = "human", eyes = C(20, 14, 20) },
            ["goblin"] = new Spec {
                skin = U.Ramp("#2a4a1a", "#4a7a26", "#6ea234", "#94c84a"), hair = null, hairStyle = "bald",
                tunic = U.Ramp("#2a1c12", "#4a3420", "#6a4e30", "#8a6a42"), pants = U.Ramp("#1e1610", "#33261a", "#4a3826"), boots = U.Ramp("#140e0a", "#261a10", "#3a2818"),
                weapon = "dagger", ears = "goblin", eyes = C(250, 210, 60), small = true },
            ["shaman"] = new Spec {
                skin = U.Ramp("#2a4a1a", "#4a7a26", "#6ea234", "#94c84a"), hair = U.Ramp("#3a1418", "#5e2228", "#86343a", "#a84a4a"), hairStyle = "hood",
                tunic = U.Ramp("#3a1418", "#5e2228", "#86343a", "#a84a4a"), pants = U.Ramp("#1e1610", "#33261a", "#4a3826"), boots = U.Ramp("#140e0a", "#261a10", "#3a2818"),
                robe = true, weapon = "staff", orb = U.Ramp("#6a1a10", "#ff7a2a", "#ffe0a0"), ears = "goblin", eyes = C(250, 120, 40), small = true, bones = true },
            ["chief"] = new Spec {
                skin = U.Ramp("#24401a", "#3e6a24", "#5a8e30", "#7cb040"), hair = U.Ramp("#1a1010", "#2e1c14", "#4a2e1e", "#5e3c24"), hairStyle = "mohawk",
                tunic = U.Ramp("#2a2a30", "#44464e", "#62666e", "#8a8e96"), pants = U.Ramp("#1e1610", "#33261a", "#4a3826"), boots = U.Ramp("#140e0a", "#261a10", "#3a2818"),
                weapon = "axe", ears = "goblin", eyes = C(255, 60, 40), big = true, cape = U.Ramp("#3a0e10", "#5e1a1a", "#862828", "#a83a32") },
            // --- the prologue
            ["figure"] = new Spec { // the faceless crowd of dreamed Velmoor
                skin = U.Ramp("#8a8e9a", "#a8acb8", "#c4c8d2", "#dcdfe6"), hair = U.Ramp("#6a6e7c", "#868a98", "#a2a6b4", "#bec2ce"), hairStyle = "hood",
                tunic = U.Ramp("#7a8090", "#9aa0ae", "#b8bdc8", "#d4d8e0"), pants = U.Ramp("#7a8090", "#9aa0ae", "#b8bdc8"), boots = U.Ramp("#5a5e6a", "#72768a", "#8a8ea0"),
                robe = true, weapon = "none", ears = "human", faceless = true, blush = false },
            ["archivist"] = new Spec { // the silver woman of the dream, and her reflection in the Relicário
                skin = U.Ramp("#9a8a90", "#d4c4c8", "#f0e4e6", "#fff6f6"), hair = U.Ramp("#7a8094", "#aab2c4", "#d6dce8", "#f8faff"), hairStyle = "long",
                tunic = U.Ramp("#4a4a6a", "#7a7aa0", "#aeb0d0", "#e0e2f4"), pants = U.Ramp("#4a4a6a", "#7a7aa0", "#aeb0d0"), boots = U.Ramp("#2a2a3a", "#4a4a5e", "#6a6a80"),
                robe = true, trim = U.Ramp("#6a7088", "#b0b8d0", "#f0f4ff"), weapon = "none", ears = "human", eyes = C(150, 190, 240) },
            ["statue"] = new Spec { // a Velmoor archivist carved in marble (makeStatue greys it out)
                skin = U.Ramp("#606060", "#909090", "#b8b8b8", "#d8d8d8"), hair = U.Ramp("#505050", "#808080", "#a8a8a8", "#c8c8c8"), hairStyle = "hood",
                tunic = U.Ramp("#585858", "#888888", "#b0b0b0", "#d0d0d0"), pants = U.Ramp("#585858", "#888888", "#b0b0b0"), boots = U.Ramp("#404040", "#606060", "#808080"),
                robe = true, weapon = "staff", orb = U.Ramp("#2a6a8a", "#5ad0ff", "#d0f8ff"), ears = "human", faceless = true, big = true },
            ["esvaido"] = new Spec { // the Forgotten: grey, quiet, white-eyed
                skin = U.Ramp("#6a6a6e", "#8e8e92", "#aeaeb0", "#c8c8ca"), hair = U.Ramp("#3a3a40", "#56565c", "#727278", "#8e8e94"), hairStyle = "long",
                tunic = U.Ramp("#3e3e48", "#585864", "#747482", "#9090a0"), pants = U.Ramp("#2e2e36", "#444450", "#5a5a68"), boots = U.Ramp("#1e1e24", "#2e2e36", "#3e3e48"),
                weapon = "none", ears = "human", eyes = C(240, 244, 255), blush = false },
            ["esvaidoFisher"] = new Spec { // Otávio, in his fisherman's clothes
                skin = U.Ramp("#6e6a66", "#928e88", "#b2aea8", "#ccc8c2"), hair = U.Ramp("#4a4a4e", "#6a6a6e", "#8a8a8e", "#a8a8ac"), hairStyle = "short", beard = "short",
                tunic = U.Ramp("#1e2a36", "#2e3e4e", "#405466", "#566c80"), pants = U.Ramp("#2a2620", "#3e382e", "#544c3e"), boots = U.Ramp("#1a1010", "#2e2018", "#423024"),
                apron = U.Ramp("#5a5444", "#7a7460", "#9a947e"), weapon = "none", ears = "human", eyes = C(240, 244, 255), blush = false },
            ["cendra"] = new Spec { // Sister Cendra of the Serene Veil
                skin = U.Ramp("#8a5a4a", "#c08a74", "#e4b498", "#f6d6be"), hair = U.Ramp("#c8ccd8", "#dde0e8", "#eef0f4", "#ffffff"), hairStyle = "hood",
                tunic = U.Ramp("#8a8e9e", "#b4b8c6", "#d8dbe4", "#f4f5f8"), pants = U.Ramp("#8a8e9e", "#b4b8c6", "#d8dbe4"), boots = U.Ramp("#3a3a48", "#565666", "#727284"),
                robe = true, trim = U.Ramp("#6a7088", "#b0b8d0", "#f0f4ff"), weapon = "staff", orb = U.Ramp("#8a9ab8", "#d0e0ff", "#ffffff"), ears = "human", eyes = C(120, 150, 190),
                cape = U.Ramp("#b8bcc8", "#d4d7e0", "#eceef2", "#ffffff") },
            ["silas"] = new Spec { // Brother Silas, the monk who doubted
                skin = U.Ramp("#6a4430", "#9a6a4a", "#c49068", "#e0b48a"), hair = null, hairStyle = "bald",
                tunic = U.Ramp("#7e8290", "#a6aab6", "#cacdd6", "#e6e8ee"), pants = U.Ramp("#7e8290", "#a6aab6", "#cacdd6"), boots = U.Ramp("#3a2a20", "#5a4030", "#7a5840"),
                robe = true, weapon = "none", ears = "human", eyes = C(40, 30, 20), beard = "short" },
            ["murta"] = new Spec { // the shaman's granddaughter
                skin = U.Ramp("#2e4e1e", "#4e8028", "#72a838", "#98cc50"), hair = U.Ramp("#2a1410", "#4a2418", "#6e3a22", "#8e5030"), hairStyle = "long",
                tunic = U.Ramp("#3a2a12", "#5e4420", "#866230", "#aa8444"), pants = U.Ramp("#1e1610", "#33261a", "#4a3826"), boots = U.Ramp("#140e0a", "#261a10", "#3a2818"),
                weapon = "bow", ears = "goblin", eyes = C(250, 200, 60), small = true, cape = U.Ramp("#2a3a1a", "#3e5426", "#566e32", "#6e8a40") },
            ["fiapo"] = new Spec { // the patrol's skinny talker
                skin = U.Ramp("#34501c", "#56822a", "#7aaa3a", "#a0d050"), hair = U.Ramp("#2a1c12", "#4a3420", "#6a4e30", "#8a6a42"), hairStyle = "hood",
                tunic = U.Ramp("#3a2418", "#5a3a26", "#7a5434", "#9a6e46"), pants = U.Ramp("#1e1610", "#33261a", "#4a3826"), boots = U.Ramp("#140e0a", "#261a10", "#3a2818"),
                weapon = "dagger", ears = "goblin", eyes = C(250, 230, 90), small = true },
            ["goblinElder"] = new Spec { // the clan's old ones, hiding in the shelter
                skin = U.Ramp("#3a4a2a", "#5a6e40", "#7a9058", "#9ab070"), hair = U.Ramp("#6a6a60", "#8a8a80", "#aaaaa0", "#c8c8c0"), hairStyle = "long",
                tunic = U.Ramp("#3a3228", "#56483a", "#72624e", "#8e7e66"), pants = U.Ramp("#2a241c", "#3e3428", "#544836"), boots = U.Ramp("#140e0a", "#261a10", "#3a2818"),
                robe = true, weapon = "none", ears = "goblin", eyes = C(230, 200, 120), small = true },
            ["goblinKid"] = new Spec {
                skin = U.Ramp("#3a5a1e", "#5e8e2c", "#82b43e", "#a8d858"), hair = null, hairStyle = "bald",
                tunic = U.Ramp("#4a2a2a", "#6a3e3a", "#8a564e", "#aa7066"), pants = U.Ramp("#1e1610", "#33261a", "#4a3826"), boots = U.Ramp("#140e0a", "#261a10", "#3a2818"),
                weapon = "none", ears = "goblin", eyes = C(250, 220, 80), small = true },
        };

        public static Spec Get(string key) => SPECS[key];

        class BoxOpt { public int round; public bool flipLight; public double @base = 0.55; }
        static readonly BoxOpt NoOpt = new BoxOpt();

        static void Box(PixBuf pb, double x, double y, double w, double h, Col[] R, BoxOpt o = null)
        {
            o ??= NoOpt;
            int round = o.round; bool flipLight = o.flipLight; double bse = o.@base;
            for (int j = 0; j < h; j++)
                for (int i = 0; i < w; i++)
                {
                    if (round != 0 && ((i < round && j < round && i + j < round) || (i >= w - round && j < round && (w - 1 - i) + j < round) ||
                        (i < round && j >= h - round && i + (h - 1 - j) < round) || (i >= w - round && j >= h - round && (w - 1 - i) + (h - 1 - j) < round))) continue;
                    double v = bse;
                    double li = flipLight ? w - 1 - i : i;
                    if (li == 0) v += 0.22;
                    if (li == w - 1) v -= 0.28;
                    if (j == 0) v += 0.15;
                    if (j == h - 1) v -= 0.22;
                    pb.Set(x + i, y + j, U.RampAt(R, U.Clamp(v), x + i, y + j));
                }
        }

        static PixBuf DrawSprite(Spec S, int dir, int frame, string pose)
        {
            var pb = new PixBuf(SW, SH);
            const int cx = 13;
            bool sm = S.small, big = S.big, st = S.stout; // stout: short legs, broad body (dwarves)
            // layout
            const int feet = 34;
            int lh = sm || st ? 5 : 7, th = sm ? 7 : big ? 11 : st ? 9 : 10, hh = sm ? 11 : 12, hw = 12;
            int phase = pose == "walk" ? new[] { 1, 0, -1, 0 }[frame] : 0;
            int bob = pose == "walk" && frame % 2 == 0 ? 1 : 0;
            int ly = feet - lh;
            int ty = ly - th + 1 + bob;
            int hy = ty - hh + 1;
            int tw = big || st ? 12 : sm ? 9 : 10;
            bool side = dir == 1 || dir == 2;
            bool back = dir == 3;
            int wlen = S.wlen;
            Col[] orbR = S.orb ?? ORB_SKY;

            void Legs()
            {
                if (S.robe && !side)
                {
                    // feet peeking under the robe
                    int l = phase == 1 ? -1 : 0, r = phase == -1 ? -1 : 0;
                    Box(pb, cx - 4, feet - 2 + l, 3, 2, S.boots);
                    Box(pb, cx + 1, feet - 2 + r, 3, 2, S.boots);
                    return;
                }
                if (side)
                {
                    int sw = phase * 2;
                    void Leg(int dx, bool shade)
                    {
                        int x = cx - 1 + dx;
                        Box(pb, x, ly + bob, 3, lh - 2 - bob, shade ? U.Scale(S.pants, 0.8) : S.pants);
                        Box(pb, x + (dir == 2 ? 0 : -1), feet - 2, 4, 2, S.boots);
                    }
                    Leg(-sw, true);
                    Leg(sw, false);
                    return;
                }
                int Lift(int p) => phase == p ? 1 : 0;
                Box(pb, cx - 4, ly + bob, 3, lh - 2 - bob - Lift(1), S.pants);
                Box(pb, cx - 4, feet - 2 - Lift(1), 3, 2, S.boots);
                Box(pb, cx + 1, ly + bob, 3, lh - 2 - bob - Lift(-1), S.pants);
                Box(pb, cx + 1, feet - 2 - Lift(-1), 3, 2, S.boots);
            }

            void CapeBack()
            {
                if (S.cape == null) return;
                if (back) return; // drawn on top later
                if (side)
                {
                    int x = dir == 2 ? cx - 5 : cx + 2;
                    int flutter = pose == "walk" ? new[] { 0, 1, 0, 1 }[frame] : 0;
                    Box(pb, x, ty + 1, 3, th + 2 + flutter, S.cape, new BoxOpt { flipLight = dir == 1 });
                }
                else Box(pb, cx - tw / 2.0 - 1, ty + 1, tw + 2, th + 1, S.cape);
            }

            void Torso()
            {
                int w = side ? 7 : tw; double x = cx - FL(w / 2.0);
                int h = S.robe ? feet - ty - (side ? 1 : 2) : th;
                Box(pb, x, ty, w, h, S.tunic, new BoxOpt { round = 1, flipLight = dir == 1 });
                if (S.robe)
                {
                    // flare at the hem
                    Box(pb, x - 1, ty + h - 3, w + 2, 3, S.tunic, new BoxOpt { flipLight = dir == 1 });
                    if (S.trim != null) for (int i = 0; i < w + 2; i++) pb.Set(x - 1 + i, ty + h - 1, S.trim[(i & 1) + 1]);
                    if (S.apron != null && !back) Box(pb, x + 1 + (side ? (dir == 2 ? 2 : -1) : 1), ty + 4, side ? 3 : w - 4, h - 6, S.apron);
                }
                else
                {
                    // belt
                    for (int i = 0; i < w; i++) pb.Set(x + i, ty + th - 3, C(40, 24, 18));
                    if (!back) pb.Set(x + (side ? (dir == 2 ? w - 2 : 1) : FL(w / 2.0)), ty + th - 3, GOLD[2]);
                }
                if (!back && !side) { pb.Set(cx - 1, ty, S.skin[1]); pb.Set(cx, ty, S.skin[1]); }
                if (S.bones && !back) for (int i = 0; i < w; i += 2) pb.Set(x + i, ty + 1, C(230, 220, 196));
                if (S.studs && !back) for (int j = 2; j < th - 4; j += 2) for (int i = 1 + ((j & 2) != 0 ? 1 : 0); i < w - 1; i += 3) pb.Set(x + i, ty + j, METAL[3]);
                if (S.fur) for (int i = -1; i <= w; i++) { pb.Set(x + i, ty, C(196, 176, 140)); if ((i + frame) % 2 != 0) pb.Set(x + i, ty + 1, C(150, 128, 96)); }
                if (S.armor && !S.robe)
                { // steel pauldrons and a breastplate edge
                    var pads = side ? new[] { dir == 2 ? x + 1 : x + w - 4 } : new[] { x - 1, x + w - 2 };
                    foreach (var px in pads) Box(pb, px, ty, 3, 3, METAL, new BoxOpt { round = 1, flipLight = dir == 1 });
                    if (!back && !side) for (int j = 3; j < th - 3; j++) pb.Set(cx - 1 + (j & 1), ty + j, METAL[2]);
                }
            }

            void Arm(double x, double y, int len, bool shade, bool hand = true)
            {
                var R = shade ? U.Scale(S.tunic, 0.75) : S.tunic;
                Box(pb, x, y, 2, len - 2, R);
                if (hand) Box(pb, x, y + len - 2, 2, 2, S.skin);
            }

            void Arms()
            {
                int swing = pose == "walk" ? phase : 0;
                int up = pose == "cast" ? -5 : 0;
                if (side)
                {
                    int fwd = dir == 2 ? 1 : -1;
                    if (pose == "attack")
                    {
                        // arm thrust forward
                        for (int i = 0; i < 6; i++) { pb.Set(cx + fwd * i, ty + 3, S.tunic[2]); pb.Set(cx + fwd * i, ty + 4, S.tunic[1]); }
                        Box(pb, cx + fwd * 6 - (fwd < 0 ? 1 : 0), ty + 3, 2, 2, S.skin);
                        return;
                    }
                    Arm(cx - 1 - swing * fwd * 2, ty + 1 + up, 7, false);
                    return;
                }
                double lx = cx - FL(tw / 2.0) - 2, rx = cx + CE(tw / 2.0);
                if (pose == "attack" && !back)
                {
                    Arm(lx, ty + 1, 7, false);
                    // weapon arm reaches forward/down
                    Box(pb, rx - 1, ty + 4, 2, 6, S.tunic);
                    Box(pb, rx - 1, ty + 10, 2, 2, S.skin);
                    return;
                }
                Arm(lx, ty + 1 + swing + up, 7, false);
                Arm(rx, ty + 1 - swing + up, 7, true);
            }

            // ---------------------------------------------------------------- two-handed weapons
            // Big weapons are carried, not dangled: the weapon sits diagonally in front of the body, pointing where the
            // character faces, with both hands on the grip and spaced apart along it, drawn over the handle. Polearms are
            // longer and hold their hands further apart.
            void TwoHanded(string stage)
            {
                string W = S.weapon; bool pole = W == "spear", sword = W == "sword", great = wlen >= 2;
                int grip = sword ? 5 : pole ? 9 : 7; // handle length before the blade/head
                int len = sword ? 10 + wlen : pole ? 13 + wlen : 5 + wlen; // blade or haft beyond the hands
                int total = grip + len + (sword ? 1 : 0);
                int f = dir == 1 ? -1 : 1; bool attack = pose == "attack"; int bse = feet - 1;
                double lx = cx - FL(tw / 2.0) - 1, rx = cx + CE(tw / 2.0) - 1;
                // where the pommel is and which way the weapon runs (one pixel per step on the long axis)
                double[] P, D; int[] hands = sword ? new[] { 1, 3 } : pole ? new[] { 2, 7 } : new[] { 2, 5 };
                if (pole)
                {
                    // polearms stand upright beside the body, clear of the torso and the face; they only tilt to strike
                    if (side) { if (attack) { P = new double[] { cx - 6 * f, ty + 3 }; D = new[] { 0.85 * f, 0.5 }; } else { P = new double[] { cx + 6 * f, bse }; D = new double[] { 0, -1 }; } }
                    else if (back) { if (attack) { P = new[] { lx - 2, ty + 3 }; D = new[] { -0.1, -1 }; } else { P = new[] { lx - 2, bse }; D = new double[] { 0, -1 }; } }
                    else if (attack) { P = new[] { rx + 2, ty }; D = new[] { 0.12, 1 }; } // driven down beside the leg
                    else { P = new[] { rx + 3, bse }; D = new double[] { 0, -1 }; }
                    if (!attack) hands = new[] { bse - (ty + 8), bse - (ty + 2) }; // hip and shoulder height
                }
                else if (sword && !attack)
                {
                    // the low guard of a right-handed swordsman: both hands together at the left hip, the point down and out
                    // to the left. Seen from the front that's the right of the screen; from behind, the left.
                    if (side) { P = new double[] { cx + f, ty + 5 }; D = new[] { 0.7 * f, 0.8 }; len = 9; } // hands at the front of the waist
                    else if (back) { P = new double[] { cx - 2, ty + 5 }; D = new[] { -0.6, 0.8 }; len = 8; }
                    else { P = new double[] { cx + 2, ty + 5 }; D = new[] { 0.6, 0.8 }; len = 8; }
                    total = grip + len + 1;
                }
                else if (side)
                {
                    if (attack) { P = new double[] { cx - 4 * f, ty + 3 }; D = new[] { (double)f, 0.45 }; } // swung through, blade forward and down
                    else { P = new double[] { cx - 2 * f, ty + 10 }; D = new[] { 0.55 * f, -1 }; } // held up in front of the face
                }
                else if (back)
                {
                    if (attack) { P = new double[] { cx + 1, ty + 4 }; D = new[] { -0.5, -1 }; } // raised overhead, away from us
                    else { P = new double[] { cx - 6, ty + 11 }; D = new[] { 1, -0.62 }; } // across the chest: only the end shows past a shoulder
                }
                else
                {
                    if (attack) { P = new double[] { cx - 3, ty + 3 }; D = new[] { 0.45, 1 }; } // brought down in front
                    // across the chest, pommel at the hip: anything steeper would vanish behind the big head
                    else { P = new double[] { cx + 6, ty + 11 }; D = new[] { -1, -0.62 }; }
                }
                (double, double) At(double t) => (JR(P[0] + D[0] * t), JR(P[1] + D[1] * t));
                // slide the weapon back along itself until its business end fits in the cell (a clipped tip reads as nothing)
                for (int k = 0; k < 14; k++)
                {
                    var (x, y) = At(total - 1);
                    if (x >= 1 && x <= SW - 2 && y >= 1 && y <= SH - 2) break;
                    P = new[] { P[0] - D[0], P[1] - D[1] };
                }
                bool steep = Math.Abs(D[1]) >= Math.Abs(D[0]);
                // A run of pixels across the weapon at a point: up to three, light to dark from the top-left.
                void Across(double x, double y, params Col[] cs)
                {
                    for (int i = 0; i < cs.Length; i++)
                    {
                        if (steep) pb.Set(x + i - (cs.Length > 2 ? 1 : 0), y, cs[i]);
                        else pb.Set(x, y + i - (cs.Length > 2 ? 1 : 0), cs[i]);
                    }
                }
                void DrawWeapon()
                {
                    for (int t = -1; t < total; t++)
                    {
                        var (x, y) = At(t);
                        if (sword)
                        {
                            if (t == -1) Across(x, y, GOLD[2], GOLD[0]);
                            else if (t < grip) Across(x, y, C(86, 50, 30), C(52, 30, 20));
                            else if (t == grip)
                            { // the crossguard, across the blade
                                double nx2 = JR(-D[1] * 1.6), ny2 = JR(D[0] * 1.6);
                                foreach (int k in new[] { -1, 0, 1 }) pb.Set(x + nx2 * k, y + ny2 * k, GOLD[k == 0 ? 2 : 1]);
                                pb.Set(x + nx2 * 2, y + ny2 * 2, GOLD[0]); pb.Set(x - nx2 * 2, y - ny2 * 2, GOLD[0]);
                            }
                            else
                            {
                                int fromTip = total - 1 - t;
                                // a greatsword's blade is three pixels wide (edge, fuller, edge) and narrows at the point
                                if (great && fromTip > 1) Across(x, y, METAL[3], METAL[2], METAL[1]);
                                else if (fromTip == 0) Across(x, y, METAL[3]);
                                else Across(x, y, METAL[3], METAL[1]);
                            }
                        }
                        else
                        {
                            bool tip2 = pole && t >= total - 3;
                            if (tip2) { if (t == total - 1) Across(x, y, METAL[3]); else Across(x, y, METAL[3], METAL[1]); }
                            else Across(x, y, WOOD[1 + (t & 1)], WOOD[0]);
                        }
                    }
                    var (ex, ey) = At(total - 1);
                    double nx = Math.Sign(JR(-D[1])), ny = Math.Sign(JR(D[0]));
                    if (W == "axe")
                    { // a broad head on one side of the haft
                        for (int k = 1; k <= 4; k++) for (int j = -2; j <= 1; j++)
                            {
                                var (hx, hy2) = At(total - 2 + j);
                                pb.Set(hx + nx * k, hy2 + ny * k, METAL[k == 4 ? 3 : k == 1 ? 1 : 2]);
                            }
                    }
                    if (W == "hammer" || W == "mace") Box(pb, ex - 2, ey - 2, 5, 4, METAL);
                    if (pole && wlen > 0)
                    { // the halberd's axe blade, below the point, on the outer side
                        int @out = side ? f : back ? -1 : 1; bool upw = D[1] < 0;
                        for (int j = 0; j < 4; j++) for (int k = 1; k <= 3; k++)
                            {
                                var (hx, hy2) = At(total - 4 - j);
                                if (steep) pb.Set(hx + @out * k, hy2, METAL[k == 3 ? 3 : j == 0 && upw ? 3 : 2]);
                                else pb.Set(hx, hy2 + k, METAL[k == 3 ? 1 : 2]);
                            }
                    }
                }
                void Hand(double t) { var (x, y) = At(t); Box(pb, x - 1, y - 1, 2, 2, S.skin); }
                // A sleeve from the shoulder to a point on the grip, two pixels thick.
                void Sleeve(double sx, double sy, double t, bool shade)
                {
                    var (x, y) = At(t); var R = shade ? U.Scale(S.tunic, 0.75) : S.tunic;
                    double n = Math.Max(1, Math.Max(Math.Abs(x - sx), Math.Abs(y - sy)));
                    for (int i = 0; i <= n; i++)
                    {
                        double px = JR(sx + ((x - sx) * i) / n), py = JR(sy + ((y - sy) * i) / n);
                        pb.Set(px, py, R[2]); pb.Set(px + 1, py, R[1]); pb.Set(px, py + 1, R[1]);
                    }
                }
                // a polearm thrust from the side runs past the far side of the body: the body hides the middle of the shaft
                bool sideThrust = side && pole && attack;
                // facing right, the left hip is the far side: the low guard sits behind the body, and only the near hand shows
                bool farGuard = side && sword && !attack && dir == 2;
                if (stage == "behind")
                {
                    if ((back && !pole) || sideThrust || farGuard) DrawWeapon();
                    if (farGuard) Hand(hands[0]);
                    return;
                }
                if (back)
                { // the arms reach forward, out of sight: just the shoulders and upper arms
                    if (pole) DrawWeapon();
                    Box(pb, lx - 1, ty + 1, 2, 4, S.tunic); Box(pb, rx + 1, ty + 1, 2, 4, S.tunic);
                    return;
                }
                if (side)
                {
                    if (!sideThrust && !farGuard) DrawWeapon();
                    if (!farGuard) Hand(hands[0]); // the far hand, lower on the grip
                    Sleeve(cx - f, ty + 2, hands[1], false);
                    Hand(hands[1]);
                    return;
                }
                // the arms go under the weapon: they hold it, it doesn't pass through them
                Sleeve(rx, ty + 1, pole && !attack ? hands[1] : hands[0], true);
                Sleeve(lx, ty + 1, pole && !attack ? hands[0] : hands[1], false);
                DrawWeapon();
                Hand(hands[0]); Hand(hands[1]);
            }

            void Head()
            {
                int w = side ? 11 : hw;
                double x = cx - FL(w / 2.0);
                Box(pb, x, hy, w, hh, S.skin, new BoxOpt { round = 3, @base = 0.6, flipLight = dir == 1 });
                // ears
                double earY = hy + FL(hh * 0.55);
                if (S.ears == "elf" || S.ears == "goblin")
                {
                    int L = S.ears == "goblin" ? 4 : 2;
                    var sides = side ? new[] { dir == 2 ? -1 : 1 } : new[] { -1, 1 };
                    foreach (var s in sides)
                    {
                        double ex = s < 0 ? x - 1 : x + w;
                        for (int i = 0; i < L; i++) { pb.Set(ex + s * i, earY - i, S.skin[i == L - 1 ? 3 : 2]); pb.Set(ex + s * i, earY - i + 1, S.skin[1]); }
                    }
                }
                if (back || S.faceless) return;
                // face
                double ey = hy + FL(hh * 0.58);
                void Eye(double ex)
                {
                    if (S.ears == "goblin") { pb.Set(ex, ey, S.eyes); pb.Set(ex, ey + 1, C(20, 10, 10)); }
                    else { pb.Set(ex, ey, S.eyes); pb.Set(ex, ey + 1, S.eyes); }
                }
                var TUSK = C(240, 240, 220);
                if (side)
                {
                    int f = dir == 2 ? 1 : -1;
                    Eye(cx + f * 3);
                    if (S.femme) pb.Set(cx + f * 4, ey - 1, INK);
                    pb.Set(cx + f * 6, ey + 1, S.skin[2]); // nose
                    pb.Set(cx + f * 3, ey + 3, S.skin[0]);
                    if (S.tusks) { pb.Set(cx + f * 4, ey + 2, TUSK); pb.Set(cx + f * 4, ey + 3, TUSK); }
                }
                else
                {
                    Eye(cx - 3); Eye(cx + 2);
                    if (S.femme) { pb.Set(cx - 4, ey - 1, INK); pb.Set(cx + 3, ey - 1, INK); pb.Set(cx - 1, ey + 3, C(200, 110, 110)); }
                    if (S.blush != false) { pb.Set(cx - 4, ey + 2, C(230, 120, 110)); pb.Set(cx + 3, ey + 2, C(230, 120, 110)); }
                    pb.Set(cx - 1, ey + 3, S.skin[0]); pb.Set(cx, ey + 3, S.skin[0]);
                    if (S.ears == "goblin" || S.tusks) { pb.Set(cx - 2, ey + 3, TUSK); pb.Set(cx + 1, ey + 3, TUSK); } // fangs / tusks
                    if (S.tusks) { pb.Set(cx - 3, ey + 2, TUSK); pb.Set(cx + 2, ey + 2, TUSK); }
                }
            }

            void Hair()
            {
                var H = S.hair;
                if (H == null || S.hairStyle == "bald") return;
                int w = side ? 11 : hw;
                double x = cx - FL(w / 2.0);
                void Px(double i, double j, double v) => pb.Set(x + i, hy + j, U.RampAt(H, U.Clamp(v), x + i, hy + j));
                double ShadeAt(double i, double j) => 0.62 + (dir == 1 ? i - w / 2.0 : w / 2.0 - i) * 0.035 - j * 0.03;
                if (S.hairStyle == "mohawk")
                {
                    for (int j = -3; j < hh - 4; j++) for (double i = FL(w / 2.0) - 1; i <= FL(w / 2.0) + 1; i++) if (j < 3 || back) Px(i, j, ShadeAt(i, j) + 0.1);
                    return;
                }
                bool hood = S.hairStyle == "hood";
                bool lng = S.hairStyle == "long" || hood;
                for (int j = -1; j < hh + (lng ? 6 : 0); j++)
                    for (int i = -1; i <= w; i++)
                    {
                        bool on = false;
                        if (back) on = j < hh - (lng ? -5 : 2) && i >= (j < 1 ? 1 : 0) - (j > 2 && hood ? 1 : 0) && i < w - (j < 1 ? 1 : 0) + (j > 2 && hood ? 1 : 0);
                        else if (side)
                        {
                            bool f = dir == 2;
                            bool backSide = f ? i < 5 : i > w - 6;
                            on = (j < 4 && i >= 0 && i < w) || (j == 4 && (f ? i < 9 : i > 1)) || (backSide && j < (lng ? hh + 5 : hh - 2) && i >= -1 && i <= w);
                            if (hood) on = on || (j < hh && (f ? i < 3 : i > w - 4));
                        }
                        else
                        {
                            on = j < 4 && i >= 0 && i < w;
                            if (j == -1) on = i >= 2 && i < w - 2;
                            if (j == 4) on = i < 3 || i > w - 4 || i == 5 || (i == 6 && !hood);
                            if (j > 4) on = (i <= (hood ? 1 : 0) || i >= w - (hood ? 2 : 1)) && j < (lng ? hh + 5 : hh - 3);
                            if (hood && j > 4) on = (i <= 1 || i >= w - 2) && j < hh + 1;
                        }
                        if (on) Px(i, j, ShadeAt(i, j));
                    }
                if (S.hairStyle == "bun") for (int j = -4; j < 0; j++) for (int i = 4; i < 8; i++) if (!(j == -4 && (i == 4 || i == 7))) Px(i, j, 0.7 - j * 0.02);
                // a highlight streak
                if (!hood) for (int i = 2; i < w - 4; i += 2) pb.Set(x + i, hy + 1, H[H.Length - 1]);
            }

            void Beard()
            {
                var H = S.hair;
                if (H == null || S.beard == null || back) return;
                double ey = hy + FL(hh * 0.58); bool lng = S.beard == "long";
                int chin = hy + hh - 1 + (lng ? 5 : 1);
                void Px(double x, double y, double v) => pb.Set(x, y, U.RampAt(H, U.Clamp(v), x, y));
                if (side)
                {
                    int f = dir == 2 ? 1 : -1;
                    for (double y = ey + 2; y <= chin; y++) for (int i = 0; i < 6; i++) if (y > ey + 2 || i > 1) Px(cx + f * (i - (y > hy + hh ? 1 : 0)), y, 0.55 - (y - ey) * 0.02 + i * 0.02);
                    return;
                }
                for (double y = ey + 2; y <= chin; y++)
                {
                    double half = y <= hy + hh - 1 ? 5 : Math.Max(1, 5 - (y - hy - hh) * (lng ? 0.8 : 2));
                    for (double x = JR(cx - half); x < JR(cx + half); x++)
                    {
                        if (y == ey + 2 && x >= cx - 2 && x < cx + 2) continue; // mouth
                        Px(x, y, 0.62 - (x - cx) * 0.03 - (y - ey) * 0.015);
                    }
                }
            }

            void Horns()
            {
                if (!S.horns) return;
                int w = side ? 11 : hw; double x = cx - FL(w / 2.0);
                void One(double bx, int s)
                { // grows up and curls outward
                    var pts = new[] { (0, 0), (0, -1), (s, -2), (s, -3), (s * 2, -3) };
                    for (int i = 0; i < pts.Length; i++) pb.Set(bx + pts[i].Item1, hy + pts[i].Item2, HORN[Math.Min(3, 1 + (i >> 1))]);
                    pb.Set(bx + s, hy - 1, HORN[0]);
                }
                if (side) { int f = dir == 2 ? 1 : -1; One(cx - f * 1, -f); return; }
                One(x + 2, -1); One(x + w - 3, 1);
            }

            void CapeFront()
            {
                if (S.cape == null || !back) return;
                int flutter = pose == "walk" ? new[] { 0, 1, 0, 1 }[frame] : 0;
                Box(pb, cx - FL(tw / 2.0) - 1, ty, tw + 2, th + 3 + flutter, S.cape, new BoxOpt { round = 1 });
                for (int j = 3; j < th + 2; j += 1) { pb.Set(cx - 2, ty + j, S.cape[1]); pb.Set(cx + 2, ty + j, S.cape[1]); }
            }

            // blades and hafts: a line of pixels; maces swap the steel for a wooden haft and a knob on the end
            // hammers and spears have wooden hafts too; a spear ends in an iron point
            bool Wooden(string W) => W == "mace" || W == "hammer" || W == "spear";
            Col Shaft(int i, int len, string W) => W == "spear" && i >= len - 3 ? METAL[3] : Wooden(W) ? WOOD[1 + (i & 1)] : METAL[2];
            Col ShaftDark(string W) => Wooden(W) ? WOOD[0] : METAL[1];
            void Knob(double x, double y) => Box(pb, x - 1, y - 1, 3, 3, METAL, new BoxOpt { round = 1 });
            void Whead(string W, double x, double y) { if (W == "mace") Knob(x, y); if (W == "hammer") Box(pb, x - 2, y - 1, 5, 3, METAL); }
            int BladeLen(string W, bool attack)
            {
                int bse = W == "dagger" ? (attack ? 5 : 4) : W == "mace" || W == "hammer" ? (attack ? 7 : 6) : W == "spear" ? (attack ? 14 : 12) : attack ? 11 : W == "axe" ? 9 : 10;
                return Math.Max(3, bse + (W == "dagger" ? 0 : wlen));
            }
            void Tip(double x, double y) { pb.Set(x, y - 2, METAL[3]); pb.Set(x, y - 1, METAL[3]); pb.Set(x, y, METAL[2]); pb.Set(x - 1, y, METAL[1]); pb.Set(x + 1, y, METAL[1]); }
            void Orb(double x, double y)
            {
                var O = orbR;
                pb.Set(x, y - 1, O[2]); pb.Set(x - 1, y, O[1]); pb.Set(x, y, O[2]); pb.Set(x + 1, y, O[1]); pb.Set(x, y + 1, O[0]);
                if (pose == "cast") { pb.Set(x, y - 2, O[2]); pb.Set(x - 2, y, O[1]); pb.Set(x + 2, y, O[1]); }
            }
            // A round shield on the off arm: wood with an iron rim and boss, or Ormun's grey stone.
            void Shield()
            {
                if (S.shield == null) return;
                var R = S.shield == "stone" ? U.Ramp("#3a3e44", "#5e646c", "#868c94", "#acb2b8") : U.Ramp("#3a1e10", "#5e3418", "#844c24", "#a86a34");
                if (side)
                {
                    int f = dir == 2 ? 1 : -1;
                    Box(pb, cx + (f > 0 ? -6 : 3), ty + 1, 3, 8, R, new BoxOpt { round = 1, flipLight = dir == 1 });
                    return;
                }
                double x = back ? cx + CE(tw / 2.0) - 3 : cx - FL(tw / 2.0) - 4;
                for (int j = 0; j < 8; j++) for (int i = 0; i < 7; i++)
                    {
                        double q = Math.Pow((i - 3) / 3.5, 2) + Math.Pow((j - 3.5) / 4, 2);
                        if (q > 1) continue;
                        pb.Set(x + i, ty + 1 + j, q > 0.7 ? METAL[q > 0.85 ? 0 : 1] : U.RampAt(R, U.Clamp(0.75 - (i + j) * 0.05), x + i, ty + j));
                    }
                if (!back) { pb.Set(x + 3, ty + 4, METAL[3]); pb.Set(x + 3, ty + 5, METAL[2]); }
            }

            // A short bow seen edge-on: an arc of wood and a straight string; `pull` draws the string back.
            void BowArc(double x, double y0, int len, int s, double pull = 0)
            {
                for (int k = 0; k <= len; k++)
                {
                    double bulge = JR(2.4 * Math.Sin((Math.PI * k) / len));
                    pb.Set(x + s * bulge, y0 + k, BOWWOOD[k == 0 || k == len ? 0 : k % 3 == 0 ? 1 : 2]);
                }
                double mid = y0 + (len >> 1);
                for (int k = 1; k < len; k++)
                {
                    double d = Math.Abs(y0 + k - mid) / (len / 2.0), off = JR(pull * (1 - d));
                    pb.Set(x - s * off, y0 + k, C(222, 214, 196));
                }
            }

            void Weapon(bool behind)
            {
                string W = S.weapon;
                if (W == "none") return;
                bool isStaff = W == "staff", pole = W == "spear";
                if (back)
                {
                    if (!behind) return;
                    if (isStaff || pole) { for (int j = hy - 4; j < feet - 1; j++) pb.Set(cx + 6, j, WOOD[j % 3 == 0 ? 1 : 2]); if (pole) Tip(cx + 6, hy - 5); else Orb(cx + 6, hy - 5); return; }
                    if (W == "bow")
                    { // slung across the back
                        for (int i = 0; i < 12; i++) pb.Set(cx - 6 + i, ty + 9 - i, BOWWOOD[i % 3 == 0 ? 1 : 2]);
                        for (int i = 1; i < 11; i++) pb.Set(cx - 4 + i, ty + 10 - i, C(200, 192, 176));
                        return;
                    }
                    int len0 = W == "dagger" ? 5 : 11;
                    for (int i = 0; i < len0; i++) { pb.Set(cx - 5 + i, ty + 8 - i, Shaft(i, len0, W)); pb.Set(cx - 4 + i, ty + 8 - i, ShaftDark(W)); }
                    Whead(W, cx - 5 + len0, ty + 8 - len0);
                    pb.Set(cx - 6, ty + 9, WOOD[1]); pb.Set(cx - 7, ty + 10, WOOD[1]);
                    return;
                }
                if (behind) return;
                if (side)
                {
                    int f = dir == 2 ? 1 : -1;
                    if (isStaff || (pole && pose != "attack"))
                    {
                        int hx0 = cx + (pose == "cast" ? f * 2 : 0);
                        int top0 = hy - (pose == "cast" ? 8 : 4);
                        for (int j = top0; j < feet - 1; j++) pb.Set(hx0 + f * 1, j, WOOD[j % 3 == 0 ? 1 : 2]);
                        if (pole) Tip(hx0 + f, top0 - 1); else Orb(hx0 + f, top0 - 1);
                        return;
                    }
                    if (W == "bow")
                    {
                        bool aim = pose == "attack" || pose == "cast";
                        BowArc(cx + f * (aim ? 7 : 4), ty - (aim ? 3 : 1), aim ? 13 : 12, f, aim ? 4 : 0);
                        return;
                    }
                    if (pose == "attack")
                    {
                        int len1 = BladeLen(W, true);
                        for (int i = 0; i < len1; i++) { pb.Set(cx + f * (8 + i), ty + 3, Wooden(W) ? Shaft(i, len1, W) : METAL[3]); pb.Set(cx + f * (8 + i), ty + 4, ShaftDark(W)); }
                        pb.Set(cx + f * 7, ty + 2, GOLD[1]); pb.Set(cx + f * 7, ty + 5, GOLD[1]);
                        if (W == "axe") Box(pb, cx + f * (8 + len1 - 4) - (f < 0 ? 3 : 0), ty, 4, 7, METAL);
                        Whead(W, cx + f * (8 + len1), ty + 3);
                        return;
                    }
                    int hx = cx - 1, hy2 = ty + 7;
                    int len2 = BladeLen(W, false);
                    for (int i = 0; i < len2; i++) pb.Set(JR(hx + f * (1 + i * 0.6)), JR(hy2 + 1 + i * 0.8), Shaft(i, len2, W));
                    pb.Set(hx, hy2, GOLD[1]); pb.Set(hx + f, hy2, GOLD[1]);
                    if (W == "axe") Box(pb, hx + f * 5 - 1, hy2 + 5, 4, 4, METAL);
                    Whead(W, JR(hx + f * (1 + len2 * 0.6)), JR(hy2 + 1 + len2 * 0.8));
                    return;
                }
                // facing us
                double hxf = cx + CE(tw / 2.0);
                if (isStaff || (pole && pose != "attack"))
                {
                    int top1 = hy - (pose == "cast" ? 8 : 3);
                    for (int j = top1; j < feet; j++) pb.Set(hxf + 2, j, WOOD[j % 3 == 0 ? 1 : 2]);
                    if (pole) Tip(hxf + 2, top1 - 1); else Orb(hxf + 2, top1 - 1);
                    return;
                }
                if (W == "bow")
                {
                    bool aim = pose == "attack" || pose == "cast";
                    BowArc(hxf + 1, ty - (aim ? 4 : 1), 13, 1, aim ? 3 : 0);
                    return;
                }
                if (pose == "attack")
                {
                    int len3 = BladeLen(W, true);
                    for (int i = 0; i < len3; i++) { pb.Set(hxf, ty + 12 + i, Wooden(W) ? Shaft(i, len3, W) : METAL[3]); pb.Set(hxf + 1, ty + 12 + i, ShaftDark(W)); }
                    pb.Set(hxf - 1, ty + 12, GOLD[1]); pb.Set(hxf + 2, ty + 12, GOLD[1]);
                    if (W == "axe") Box(pb, hxf + 1, ty + 12 + len3 - 4, 4, 4, METAL);
                    Whead(W, hxf + 1, ty + 12 + len3);
                    return;
                }
                int top = ty + 6;
                int len4 = BladeLen(W, false);
                pb.Set(hxf - 1 + 1, top, GOLD[1]); pb.Set(hxf + 2, top + 1, GOLD[1]); pb.Set(hxf - 1, top + 1, GOLD[1]);
                for (int i = 0; i < len4; i++) { pb.Set(hxf + 1, top + 2 + i, Shaft(i, len4, W)); pb.Set(hxf + 2, top + 2 + i, ShaftDark(W)); }
                if (W == "axe") Box(pb, hxf + 2, top + len4 - 3, 4, 4, METAL);
                Whead(W, hxf + 2, top + 2 + len4);
            }

            // ---------------------------------------------------------------- weapons put away (out of combat)
            // One-handed blades, axes and maces hang at the left hip, for a right hand to draw across the body; anything big
            // (two-handers, polearms, bows) goes diagonally across the back. Staffs stay in hand: they're walking sticks too.
            string sheathMode = !S.sheathed || S.weapon == "none" || S.weapon == "staff" ? null
                : S.twoHand || S.weapon == "spear" || S.weapon == "bow" ? "back" : "hip";
            var LEATHER = new[] { C(34, 20, 16), C(64, 40, 26), C(94, 60, 38) };
            // A put-away weapon along a line from its low end (x0, y0) to its high end, where the hilt or the head is.
            void Carried(double x0, double y0, double x1, double y1)
            {
                string W = S.weapon; double n = Math.Max(1, Math.Max(Math.Abs(x1 - x0), Math.Abs(y1 - y0)));
                (double, double) Pt(double i) => (JR(x0 + ((x1 - x0) * i) / n), JR(y0 + ((y1 - y0) * i) / n));
                bool steep = Math.Abs(y1 - y0) >= Math.Abs(x1 - x0);
                void Put(double x, double y, Col c) => pb.Set(x, y, c);
                // a diagonal two pixels wide reads thinner than a straight one: fill the step corner to keep its weight
                bool diag = Math.Abs(x1 - x0) > 0.4 * Math.Abs(y1 - y0) && Math.Abs(y1 - y0) > 0.4 * Math.Abs(x1 - x0);
                void Dot(double x, double y, Col c, Col? c2) { Put(x, y, c); if (c2.HasValue) { if (steep) Put(x + 1, y, c2.Value); else Put(x, y + 1, c2.Value); if (diag) Put(x + 1, y + 1, c2.Value); } }
                bool blade = W == "sword" || W == "dagger";
                bool wide = blade && S.twoHand; // a greatsword's scabbard is three pixels across, its hilt longer
                void Dot3(double x, double y, Col a, Col b, Col c)
                {
                    if (!wide) { Dot(x, y, a, c); return; }
                    if (steep) { Put(x - 1, y, a); Put(x, y, b); Put(x + 1, y, c); } else { Put(x, y - 1, a); Put(x, y, b); Put(x, y + 1, c); }
                    if (diag) Put(x + 1, y + 1, c);
                }
                int gripLen = wide ? 4 : 3;
                for (int i = 0; i <= n; i++)
                {
                    var (x, y) = Pt(i); double fromTop = n - i;
                    if (blade)
                    {
                        if (fromTop == 0) Dot3(x, y, GOLD[2], GOLD[1], GOLD[0]); // pommel
                        else if (fromTop < gripLen) Dot(x, y, C(86, 50, 30), C(52, 30, 20)); // grip
                        else if (fromTop == gripLen)
                        { // the crossguard, across the scabbard's mouth
                            double ux = (x1 - x0) / n, uy = (y1 - y0) / n, gx = -uy, gy = ux;
                            for (int k = -(wide ? 3 : 2); k <= (wide ? 3 : 2); k++) Put(JR(x + gx * k), JR(y + gy * k), GOLD[k == 0 ? 2 : Math.Abs(k) > 2 ? 0 : 1]);
                        }
                        else if (i == 0) Dot3(x, y, METAL[3], METAL[2], METAL[1]); // the chape at the end of the scabbard
                        else Dot3(x, y, LEATHER[2], LEATHER[1], LEATHER[0]);
                    }
                    else if (W == "bow") Put(x, y, BOWWOOD[i == 0 || i == n ? 0 : 1 + (i % 2)]);
                    else if (W == "spear" && fromTop < 3) Dot(x, y, METAL[3], METAL[1]);
                    else Dot(x, y, WOOD[1 + (i & 1)], WOOD[0]);
                }
                var (hx, hy2) = Pt(n);
                if (W == "bow") for (int i = 1; i < n; i++) { var (x, y) = Pt(i); double k = Math.Sin((Math.PI * i) / n) * 2; Put(JR(x + (steep ? k : 0)), JR(y + (steep ? 0 : k)), C(210, 202, 186)); }
                if (W == "axe") Box(pb, hx - (x1 > x0 ? 0 : 3), hy2 - 1, 4, 4, METAL);
                if (W == "mace") Knob(hx, hy2);
                if (W == "hammer") Box(pb, hx - 2, hy2 - 1, 5, 3, METAL);
            }
            void Sheath(string stage)
            {
                int L = wlen, f = dir == 1 ? -1 : 1, belt = ty + th - 3;
                double lxh = cx - FL(tw / 2.0) - 1, rxh = cx + CE(tw / 2.0);
                if (sheathMode == "back")
                {
                    // across the back, low end at one hip, high end over the other shoulder. The high end rises beside the
                    // head, never behind it: the line is aimed through a point just outside the head and hair at chin
                    // height, then runs down across the back to the other hip.
                    int reach = S.weapon == "spear" ? 10 : S.weapon == "bow" ? 2 : S.twoHand ? 5 : 3;
                    int sgn = back ? 1 : side ? -f : -1; // which side of the screen the high end is on
                    double topX = cx + sgn * Math.Min(11, 9 + JR(reach * 0.25)), topY = ty - 6 - reach;
                    double ax = cx + sgn * 8, ay = ty - 3; // clear of the head (and of long hair) by a pixel
                    double lowY = ty + th + 1, lowX = JR(topX + ((ax - topX) * (lowY - topY)) / (ay - topY));
                    if (back)
                    {
                        // seen from behind it lies across the back, over the cape: from the left hip, diagonally up to the right
                        // shoulder, out beside the neck. Long weapons get their extra length downward (the butt near the feet).
                        if (stage != "front") return;
                        double L2 = Math.Min(feet - (ty - 6), S.weapon == "spear" ? 26 : S.weapon == "bow" ? 15 : S.twoHand ? 20 : 16);
                        double tx2 = cx + 11, ty2 = ty - 6;
                        Carried(JR(tx2 - 0.9 * L2), ty2 + L2, tx2, ty2);
                        return;
                    }
                    if (side)
                    {
                        // Seen from the side, the weapon lies along the back: over the cape, just outside the torso, so it covers
                        // neither the body's side nor hides behind it. It rises past the nape, clear of the head and hair.
                        if (stage != "front") return;
                        bool lng = S.weapon == "spear";
                        Carried(cx - f * 5, ty + th + 1, cx - f * (lng ? 10 : 8), ty - (lng ? 14 : 8));
                        return;
                    }
                    if (stage == "behind") Carried(lowX, lowY, topX, topY);
                    return;
                }
                // at the left hip: the screen's right when facing us, the left from behind; the far side when facing right
                int len = S.weapon == "dagger" ? 5 : S.weapon == "sword" ? 10 + L : 7 + L;
                bool near = !side || dir == 1;
                if ((stage == "front") != near) return;
                if (back) Carried(lxh - 3, belt + len - 2, lxh - 1, belt - 2);
                else if (side) Carried(cx - 6 * f, belt + len - 4, cx + f, belt - 2);
                else Carried(rxh + 3, belt + len - 2, rxh + 1, belt - 2); // just outside the hanging arm
            }

            bool two = S.twoHand && S.weapon != "none" && sheathMode == null;
            if (sheathMode != null) Sheath("behind"); else if (two) TwoHanded("behind"); else Weapon(true);
            CapeBack();
            if (side && !two)
            { // the far arm, behind the body
                int fwd = dir == 2 ? 1 : -1, swing = pose == "walk" ? phase : 0;
                Arm(cx - 1 + swing * fwd * 2, ty + 1, 6, true, true);
            }
            Legs();
            Torso();
            CapeFront();
            if (back) Shield();
            if (two && !side) TwoHanded("front"); else if (!two) Arms();
            if (sheathMode != null) Sheath("front");
            Head();
            Hair();
            if (!back) Shield(); // over long hair: it's strapped to the arm, in front
            Beard();
            Horns();
            if (two && side) TwoHanded("front"); // held up in front of the face
            else if (!two && sheathMode == null) Weapon(false);
            pb.Outline(INK);
            return pb;
        }

        /// <summary>dirs: 0 down, 1 left, 2 right, 3 up. frames: walk0..3, idle, attack, cast.</summary>
        public static CharSheet BuildCharacter(Spec spec)
        {
            var ch = BuildSheet(spec);
            // the same character with the weapon put away, for walking around out of combat
            if (spec.weapon != null && spec.weapon != "none" && spec.weapon != "staff") { var s = spec.Clone(); s.sheathed = true; ch.sheathed = BuildSheet(s); }
            return ch;
        }

        static readonly string[] POSES = { "walk", "walk", "walk", "walk", "idle", "attack", "cast" };
        public static PixBuf[][] DrawAll(Spec spec)
        {
            var sheet = new PixBuf[4][];
            for (int dir = 0; dir < 4; dir++)
            {
                sheet[dir] = new PixBuf[7];
                for (int f = 0; f < 7; f++) sheet[dir][f] = DrawSprite(spec, dir, f < 4 ? f : 0, POSES[f]);
            }
            return sheet;
        }

        static CharSheet BuildSheet(Spec spec)
        {
            var sheet = DrawAll(spec);
            // one atlas for the frames and one for the white silhouettes of the hit flash
            int AW = SW * 7, AH = SH * 4;
            var a = new byte[AW * AH * 4]; var fl = new byte[AW * AH * 4];
            for (int dir = 0; dir < 4; dir++)
                for (int f = 0; f < 7; f++)
                {
                    var pb = sheet[dir][f];
                    for (int y = 0; y < SH; y++)
                        for (int x = 0; x < SW; x++)
                        {
                            int s = (y * SW + x) * 4, d = (((dir * SH) + y) * AW + f * SW + x) * 4;
                            a[d] = pb.d[s]; a[d + 1] = pb.d[s + 1]; a[d + 2] = pb.d[s + 2]; a[d + 3] = pb.d[s + 3];
                            if (pb.d[s + 3] != 0) { fl[d] = fl[d + 1] = fl[d + 2] = fl[d + 3] = 255; }
                        }
                }
            var atlas = Img.From(a, AW, AH); var flash = Img.From(fl, AW, AH);
            var ch = new CharSheet { frames = new Img[4][], flash = new Img[4][], bufs = sheet };
            for (int dir = 0; dir < 4; dir++)
            {
                ch.frames[dir] = new Img[7]; ch.flash[dir] = new Img[7];
                for (int f = 0; f < 7; f++) { ch.frames[dir][f] = atlas.Sub(f * SW, dir * SH, SW, SH); ch.flash[dir][f] = flash.Sub(f * SW, dir * SH, SW, SH); }
            }
            return ch;
        }

        /// <summary>Portrait: the head and shoulders of the idle front frame (drawn scaled up by the UI).</summary>
        public static Img Portrait(CharSheet ch) => ch.frames[0][4].Sub(0, 0, SW, 24);
    }
}
