// Combat and world effects. The web version used the vendored pixelfx library; this is a compact re-creation of
// the seven effects the game spawns (campfire, fireball, hit spark, critical hit, sword slash, poof, healing bloom)
// as pixel particles with the same palettes, living in world coordinates.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Brumafolha
{
    public static class PAL
    {
        static Col[] P(params string[] h) => U.Ramp(h);
        public static readonly Col[] fire = P("#1f0b10", "#4a1118", "#8c1d1c", "#cc3a1a", "#f2701f", "#ffae35", "#ffe27a", "#fff8d6");
        public static readonly Col[] ember = P("#1a0a0e", "#3d1012", "#701a14", "#a8301a", "#e0561e", "#ff8a2a", "#ffc46a");
        public static readonly Col[] smoke = P("#0e0c12", "#1d1a22", "#2e2a35", "#433e4b", "#5c5664", "#7b7484", "#a39cab");
        public static readonly Col[] holy = P("#2a1c08", "#5a3e10", "#9a6c18", "#d8a428", "#ffd84a", "#fff09a", "#fffbe6", "#ffffff");
        public static readonly Col[] heal = P("#08201a", "#0f3f2c", "#17663e", "#24924e", "#3ec466", "#7ee88a", "#c8ffc4", "#ffffff");
        public static readonly Col[] arcane = P("#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff", "#ffffff");
        public static readonly Col[] gold = P("#1e1206", "#4a2c08", "#86520c", "#c48412", "#f0b424", "#ffe066", "#fff6c4", "#ffffff");
        public static readonly Col[] wood = P("#160c06", "#2e1a0c", "#4a2c14", "#6a421e", "#8e5c2c", "#b47c40", "#d8a464");
        public static readonly Col[] metal = P("#0c0e14", "#1c2230", "#2e3648", "#4a5468", "#6e7a90", "#9aa6ba", "#d0d8e6", "#ffffff");
        public static Col[] ByName(string n) => n switch { "fire" => fire, "ember" => ember, "holy" => holy, "heal" => heal, "arcane" => arcane, "gold" => gold, "wood" => wood, _ => fire };
    }

    public enum FxKind { Campfire, Fireball, HitSpark, CritHit, SwordSlash, Poof, Bloom }

    public class FxOpts
    {
        public float x, y, angle, radius = 4, light = 0;
        public bool flip;
        public Col[] palette;
        public int seed;
    }

    public class FxMove { public float x, y, dur, arc; }

    /// <summary>One running effect.</summary>
    public class FxInst
    {
        class P { public float x, y, vx, vy, life, max, size, ax, ay; public int kind; }
        public FxKind kind;
        public FxOpts o;
        public float x, y, t, sx, sy;
        public bool keep, stopped, arrived;
        public float life;
        public FxMove move;
        public Action onArrive, onDone;
        readonly List<P> ps = new List<P>();
        float emitAcc;
        readonly System.Random R;

        public FxInst(FxKind k, FxOpts opts)
        {
            kind = k; o = opts; x = opts.x; y = opts.y;
            R = new System.Random(opts.seed != 0 ? opts.seed : (int)(U.Rand() * 1e6f) + 1);
            switch (kind)
            {
                case FxKind.HitSpark: Burst(9, 50, 110, 0.18f, 0.32f, 1); break;
                case FxKind.CritHit: Burst(18, 70, 170, 0.25f, 0.45f, 1); Burst(8, 20, 50, 0.4f, 0.6f, 2); break;
                case FxKind.Poof:
                    for (int i = 0; i < 11; i++)
                    {
                        float a = Rf(0, Mathf.PI * 2), s = Rf(8, 26);
                        ps.Add(new P { x = x + Mathf.Cos(a) * 3, y = y - 6 + Mathf.Sin(a) * 2, vx = Mathf.Cos(a) * s, vy = Mathf.Sin(a) * s * 0.5f - 10, life = 0, max = Rf(0.45f, 0.8f), size = Rf(3, 6), kind = 3 });
                    }
                    break;
                case FxKind.Bloom:
                    for (int i = 0; i < 18; i++)
                    {
                        float a = i / 18f * Mathf.PI * 2;
                        ps.Add(new P { x = x + Mathf.Cos(a) * 11, y = y + Mathf.Sin(a) * 4, vx = -Mathf.Cos(a) * 4, vy = -Rf(18, 34), life = -Rf(0, 0.35f), max = Rf(0.7f, 1.1f), size = Rf(1, 2.2f), kind = 4 });
                    }
                    break;
            }
        }
        float Rf(float a, float b) => a + (float)R.NextDouble() * (b - a);
        Col[] Pal(Col[] def) => o.palette ?? def;

        void Burst(int n, float s0, float s1, float l0, float l1, int pk)
        {
            float dirBias = o.flip ? -1 : 1;
            for (int i = 0; i < n; i++)
            {
                float a = Rf(0, Mathf.PI * 2), s = Rf(s0, s1);
                ps.Add(new P { x = x, y = y, vx = Mathf.Cos(a) * s + dirBias * s * 0.3f, vy = Mathf.Sin(a) * s * 0.8f, life = 0, max = Rf(l0, l1), size = pk == 2 ? 3 : Rf(1, 2.4f), kind = pk, ay = 140 });
            }
        }

        public void Stop() { stopped = true; }
        public bool Done()
        {
            switch (kind)
            {
                case FxKind.Campfire: case FxKind.Fireball: return stopped && ps.Count == 0;
                case FxKind.SwordSlash: return t > 0.32f;
                default: return ps.Count == 0;
            }
        }

        public void Update(float dt)
        {
            if (kind == FxKind.Campfire && !stopped)
            {
                emitAcc += dt * 46;
                while (emitAcc > 1)
                {
                    emitAcc--;
                    bool ember = R.NextDouble() < 0.08;
                    ps.Add(new P { x = x + Rf(-6, 6), y = y - Rf(0, 3), vx = Rf(-4, 4), vy = ember ? -Rf(28, 50) : -Rf(14, 30), life = 0, max = ember ? Rf(0.9f, 1.6f) : Rf(0.35f, 0.75f), size = ember ? 1 : Rf(2, 3.6f), kind = ember ? 6 : 5, ax = Rf(-6, 6) });
                }
            }
            if (kind == FxKind.Fireball && !stopped)
            {
                emitAcc += dt * 90;
                while (emitAcc > 1)
                {
                    emitAcc--;
                    ps.Add(new P { x = x + Rf(-1.5f, 1.5f), y = y + Rf(-1.5f, 1.5f), vx = Rf(-8, 8), vy = Rf(-12, 4), life = 0, max = Rf(0.18f, 0.38f), size = Rf(1.5f, o.radius * 0.8f + 1), kind = 7 });
                }
            }
            for (int i = ps.Count - 1; i >= 0; i--)
            {
                var p = ps[i];
                p.life += dt;
                if (p.life < 0) continue;
                if (p.life >= p.max) { ps.RemoveAt(i); continue; }
                p.vx += p.ax * dt; p.vy += p.ay * dt;
                if (p.kind == 1 || p.kind == 2) { p.vx *= 1 - dt * 5; p.vy *= 1 - dt * 5; }
                if (p.kind == 3) { p.vx *= 1 - dt * 4; p.vy *= 1 - dt * 3; p.size += dt * 7; }
                if (p.kind == 5) p.vx += Mathf.Sin((t + p.max) * 9) * dt * 20;
                p.x += p.vx * dt; p.y += p.vy * dt;
            }
        }

        static Color C(Col c, float a = 1) => new Color((float)(c.r / 255), (float)(c.g / 255), (float)(c.b / 255), a);
        static Col RampK(Col[] r, float k) => r[Mathf.Clamp((int)(k * (r.Length - 1) + 0.5f), 0, r.Length - 1)];

        public void Draw(float cx, float cy)
        {
            float ox = -cx, oy = -cy;
            switch (kind)
            {
                case FxKind.Campfire:
                    {
                        // warm light on the ground first, flickering
                        if (!stopped && o.light > 0)
                        {
                            float fl = 0.85f + Mathf.Sin(t * 13) * 0.07f + Mathf.Sin(t * 29) * 0.05f;
                            Game.Glow(x + ox, y - 6 + oy, 46 * o.light / 0.55f * fl, new Color(1f, 0.55f, 0.2f, 0.33f * fl));
                        }
                        var pal = Pal(PAL.fire);
                        foreach (var p in ps)
                        {
                            if (p.life < 0) continue;
                            float k = p.life / p.max;
                            if (p.kind == 6) { Gfx.Fill(Mathf.Round(p.x + ox), Mathf.Round(p.y + oy), 1, 1, C(RampK(pal, 1 - k * 0.6f), 1 - k)); continue; }
                            float s = Mathf.Max(1, Mathf.Round(p.size * (1 - k * 0.7f)));
                            var col = RampK(pal, 1 - k * 0.85f);
                            Gfx.Fill(Mathf.Round(p.x + ox - s / 2), Mathf.Round(p.y + oy - s / 2), s, s, C(col, k > 0.8f ? (1 - k) * 5 : 1));
                        }
                        break;
                    }
                case FxKind.Fireball:
                    {
                        var pal = Pal(PAL.fire);
                        foreach (var p in ps)
                        {
                            float k = p.life / p.max, s = Mathf.Max(1, Mathf.Round(p.size * (1 - k)));
                            Gfx.Fill(Mathf.Round(p.x + ox - s / 2), Mathf.Round(p.y + oy - s / 2), s, s, C(RampK(pal, 0.9f - k * 0.7f), 1 - k * 0.6f));
                        }
                        if (!stopped)
                        {
                            float r = o.radius;
                            Game.Glow(x + ox, y + oy, r * 5, C(pal[pal.Length - 3], 0.35f));
                            for (int j = -(int)r; j <= r; j++)
                                for (int i = -(int)r; i <= r; i++)
                                {
                                    float q = (i * i + j * j) / (r * r);
                                    if (q > 1) continue;
                                    Gfx.Fill(Mathf.Round(x + ox + i), Mathf.Round(y + oy + j), 1, 1, C(RampK(pal, 1 - q * 0.6f)));
                                }
                        }
                        break;
                    }
                case FxKind.HitSpark:
                case FxKind.CritHit:
                    {
                        var pal = Pal(kind == FxKind.CritHit ? PAL.fire : PAL.gold);
                        if (t < 0.08f) Game.Glow(x + ox, y + oy, kind == FxKind.CritHit ? 30 : 16, C(pal[pal.Length - 2], 0.5f * (1 - t / 0.08f)));
                        foreach (var p in ps)
                        {
                            float k = p.life / p.max;
                            var col = RampK(pal, 1 - k * 0.7f);
                            if (p.kind == 2) { float s = Mathf.Round(p.size + k * 4); Gfx.Fill(Mathf.Round(p.x + ox - s / 2), Mathf.Round(p.y + oy - s / 2), s, s, C(col, (1 - k) * 0.6f)); continue; }
                            // a short streak along the velocity
                            float vl = Mathf.Max(1, Mathf.Sqrt(p.vx * p.vx + p.vy * p.vy));
                            for (int s = 0; s < 3; s++)
                                Gfx.Fill(Mathf.Round(p.x + ox - p.vx / vl * s), Mathf.Round(p.y + oy - p.vy / vl * s), 1, 1, C(col, (1 - k) * (1 - s * 0.3f)));
                        }
                        break;
                    }
                case FxKind.SwordSlash:
                    {
                        // a bright crescent that sweeps through, then fades
                        var pal = Pal(PAL.metal);
                        float r = o.radius, sweep = Mathf.Clamp01(t / 0.12f), fade = Mathf.Clamp01(1 - (t - 0.12f) / 0.2f);
                        float f = o.flip ? -1 : 1;
                        int n = 26;
                        for (int i = 0; i < n * sweep; i++)
                        {
                            float k = i / (float)n, a = Mathf.Lerp(-2.2f, 0.9f, k);
                            float th = Mathf.Sin(k * Mathf.PI) * 3.2f;
                            for (int w = 0; w < th; w++)
                            {
                                float rr = r - w;
                                float px = x + f * Mathf.Cos(a) * rr * 0.75f, py = y - 12 + Mathf.Sin(a) * rr * 0.55f;
                                var col = RampK(pal, 1 - w / 4f * 0.6f);
                                Gfx.Fill(Mathf.Round(px + ox), Mathf.Round(py + oy), 1, 1, C(col, fade * (0.5f + k * 0.5f)));
                            }
                        }
                        break;
                    }
                case FxKind.Poof:
                    {
                        var pal = PAL.smoke;
                        foreach (var p in ps)
                        {
                            float k = p.life / p.max, s = Mathf.Round(p.size);
                            var col = RampK(pal, 0.85f - k * 0.5f);
                            Disc(p.x + ox, p.y + oy, s / 2, C(col, (1 - k) * 0.85f));
                        }
                        break;
                    }
                case FxKind.Bloom:
                    {
                        var pal = Pal(PAL.heal);
                        if (t < 0.5f) Game.Glow(x + ox, y - 10 + oy, 26, C(pal[pal.Length - 3], 0.3f * (1 - t / 0.5f)));
                        foreach (var p in ps)
                        {
                            if (p.life < 0) continue;
                            float k = p.life / p.max, s = Mathf.Max(1, Mathf.Round(p.size));
                            var col = RampK(pal, 1 - k * 0.5f);
                            Gfx.Fill(Mathf.Round(p.x + ox), Mathf.Round(p.y + oy), s, s, C(col, 1 - k));
                            if (s >= 2 && k < 0.5f) Gfx.Fill(Mathf.Round(p.x + ox) - 1, Mathf.Round(p.y + oy) + s / 2, s + 2, 1, C(col, (1 - k) * 0.5f));
                        }
                        break;
                    }
            }
        }

        static void Disc(float cx, float cy, float r, Color c)
        {
            int R = Mathf.CeilToInt(r);
            for (int j = -R; j <= R; j++)
            {
                float hw = Mathf.Sqrt(Mathf.Max(0, r * r - j * j));
                if (hw < 0.5f) continue;
                Gfx.Fill(Mathf.Round(cx - hw), Mathf.Round(cy + j), Mathf.Round(hw * 2), 1, c);
            }
        }
    }

    public class FxLayer
    {
        public List<FxInst> list = new List<FxInst>();

        /// <summary>opts: x, y in world px plus the effect's options. extra: move toward a point, onArrive, keep, life.</summary>
        public FxInst Spawn(FxKind kind, FxOpts opts, FxMove move = null, Action onArrive = null, bool keep = false, float life = 0)
        {
            var e = new FxInst(kind, opts) { move = move, onArrive = onArrive, keep = keep, life = life };
            if (move != null) { e.sx = e.x; e.sy = e.y; }
            list.Add(e);
            return e;
        }
        public FxInst Spawn(FxKind kind, float x, float y, Col[] palette = null, bool flip = false, float radius = 4) => Spawn(kind, new FxOpts { x = x, y = y, palette = palette, flip = flip, radius = radius });

        public void Update(float dt)
        {
            for (int i = 0; i < list.Count; i++)
            {
                var e = list[i];
                e.t += dt;
                e.Update(dt);
                if (e.move != null)
                {
                    float k = Mathf.Min(1, e.t / e.move.dur);
                    e.x = e.sx + (e.move.x - e.sx) * k; e.y = e.sy + (e.move.y - e.sy) * k - Mathf.Sin(k * Mathf.PI) * e.move.arc;
                    if (k >= 1 && !e.arrived) { e.arrived = true; e.onArrive?.Invoke(); e.Stop(); }
                }
                if (e.life > 0 && e.t > e.life && !e.stopped) e.Stop();
            }
            for (int i = list.Count - 1; i >= 0; i--)
            {
                var e = list[i];
                bool d = e.Done();
                if (d) e.onDone?.Invoke();
                if (d && !e.keep) list.RemoveAt(i);
            }
        }

        public void Draw(float camX, float camY, int vw, int vh)
        {
            foreach (var e in list)
                if (e.x > camX - 200 && e.x < camX + vw + 200 && e.y > camY - 200 && e.y < camY + vh + 260) e.Draw(camX, camY);
        }
    }
}
