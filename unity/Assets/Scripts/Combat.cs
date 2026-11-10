// Turn-based combat on the tile grid: initiative, movement, an action and a bonus action per turn,
// d20 attack rolls against armour class, spells with slots, and enemies that think a little. Ported from src/combat.js.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace Brumafolha
{
    public class Ability
    {
        public string key, name, icon, cost, kind, desc, per, dmg, heal, pal, effect;
        public int range;
        public bool slot;
        public Ability Clone() => (Ability)MemberwiseClone();
    }

    public class CombatState
    {
        public List<Unit> order; public int idx = -1, round; public Unit active; public Group group;
        public string ability; public List<Vector2Int> preview; public bool busy, someoneDown, alliesIn;
    }

    public static class Combat
    {
        const int TILE = U.TILE, MW = World.MW;
        public static Vector2Int TileOf(Unit u) => new Vector2Int(Mathf.FloorToInt(u.x / TILE), Mathf.FloorToInt((u.y - 1) / TILE));
        public static Vector2 TileCenter(int tx, int ty) => new Vector2(tx * TILE + 16, ty * TILE + 26);
        static int Cheb(Unit a, Unit b) { var p = TileOf(a); var q = TileOf(b); return Math.Max(Math.Abs(p.x - q.x), Math.Abs(p.y - q.y)); }
        static string FmtRoll(U.RollResult r) => string.Join("+", r.rolls) + (r.mod != 0 ? (r.mod > 0 ? "+" + r.mod : r.mod.ToString()) : "");

        static Unit OccupiedBy(int tx, int ty, Unit except)
        {
            foreach (var u in G.party.Concat(G.enemies).Concat(G.npcs).Concat(G.followers))
            {
                if (u == except || u.hp <= 0 || u.gone || u.ghost) continue;
                var t = TileOf(u); if (t.x == tx && t.y == ty) return u;
            }
            return null;
        }
        public static Func<int, int, bool> BlockedFor(Unit u) => (tx, ty) => G.W.Blocked(tx, ty) || OccupiedBy(tx, ty, u) != null;

        public static int HitChance(Unit att, Unit def, int bonus) { int need = def.ac - bonus; return Math.Max(5, Math.Min(95, (21 - need) * 5)); }

        // ---------------------------------------------------------------- abilities
        static Ability A(string key, string name, string icon, string cost, int range, string kind, string desc, string per = null, bool slot = false, string dmg = null, string heal = null, string pal = null, string effect = null)
            => new Ability { key = key, name = name, icon = icon, cost = cost, range = range, kind = kind, desc = desc, per = per, slot = slot, dmg = dmg, heal = heal, pal = pal, effect = effect };
        public static readonly Dictionary<string, Ability> ABILITIES = new List<Ability> {
            A("attack", "Ataque", "sword", "action", 1, "attack", "Golpe corpo a corpo com a arma. Clique num inimigo adjacente."),
            A("cleave", "Golpe Giratório", "spin", "action", 0, "cleave", "Gira a espada e atinge todos os inimigos adjacentes. 1x por combate.", per: "combat"),
            A("secondwind", "Retomar Fôlego", "wind", "bonus", 0, "self", "Ação bônus: recupera 1d10 + nível PV. 1x por descanso.", per: "rest"),
            A("firebolt", "Rajada de Fogo", "fire", "action", 10, "bolt", "Truque: dispara uma bola de fogo. 1d10 de dano de fogo, alcance 10.", dmg: "1d10", pal: "fire"),
            A("missiles", "Mísseis Mágicos", "sparkle", "action", 10, "missiles", "Magia de 1º círculo: três dardos que nunca erram, 1d4+1 cada.", slot: true),
            A("heal", "Curar Ferimentos", "heart", "action", 6, "heal", "Magia de 1º círculo: um aliado recupera 1d8+3 PV.", slot: true, heal: "1d8"),
            A("shoot", "Disparar", "bow", "action", 10, "shoot", "Ataque à distância com o arco."),
            A("sacredflame", "Chama Sagrada", "sun", "action", 8, "bolt", "Truque: luz radiante desce sobre um inimigo. 1d8 de dano, alcance 8.", dmg: "1d8", pal: "holy"),
            A("healword", "Palavra Curativa", "dove", "bonus", 6, "heal", "Ação bônus, magia de 1º círculo: um aliado à distância recupera 1d4 + SAB PV.", slot: true, heal: "1d4"),
            A("cunning", "Ação Ardilosa", "boot", "bonus", 0, "dash", "Ação bônus: dispara e ganha movimento extra igual ao seu deslocamento."),
            A("mark", "Marca do Caçador", "target", "bonus", 12, "mark", "Ação bônus, magia: marca um inimigo; seus ataques com arma nele causam +1d6.", slot: true),
            A("potion", "Poção de Cura", "potion", "bonus", 1, "potion", "Ação bônus: você ou um aliado adjacente bebe e recupera 2d4+2 PV."),
            A("rage", "Fúria", "rage", "bonus", 0, "rage", "Ação bônus: até o fim do combate, +2 de dano corpo a corpo e metade do dano de armas. 1x por combate.", per: "combat"),
            A("smite", "Golpe Divino", "bolt", "bonus", 0, "smite", "Ação bônus, gasta um espaço: o próximo acerto corpo a corpo causa +2d8 de dano radiante.", slot: true),
            A("layhands", "Cura pelas Mãos", "hands", "action", 1, "layhands", "Toque num aliado adjacente (ou em você): cura 5 × nível PV. 1x por descanso.", per: "rest"),
            A("mockery", "Zombaria Viciosa", "mask", "action", 8, "bolt", "Truque: um insulto com magia. 1d4 de dano psíquico, e o próximo ataque do alvo leva −5.", dmg: "1d4", pal: "arcane", effect: "mock"),
            A("inspire", "Inspiração de Bardo", "note", "bonus", 8, "inspire", "Ação bônus: um aliado soma 1d6 ao próximo ataque. 1x por combate.", per: "combat"),
            A("eldritch", "Rajada Mística", "orb", "action", 12, "bolt", "Truque: um raio de força crepitante. 1d10 de dano, alcance 12.", dmg: "1d10", pal: "arcane"),
            A("hex", "Maldição", "eye", "bonus", 12, "mark", "Ação bônus, magia: amaldiçoa um inimigo; todos os seus ataques nele, magias também, causam +1d6.", slot: true),
            A("produceflame", "Criar Chama", "fire", "action", 6, "bolt", "Truque: uma chama na palma da mão, arremessada. 1d8 de dano de fogo, alcance 6.", dmg: "1d8", pal: "fire"),
            A("entangle", "Constrição", "vine", "action", 8, "entangle", "Magia: raízes agarram um inimigo. Ele rola d20 + bônus contra a CD das suas magias; se falhar, perde o próximo turno.", slot: true),
            A("flurry", "Rajada de Golpes", "fist", "bonus", 1, "flurry", "Ação bônus, depois de atacar neste turno: dois golpes desarmados rápidos num inimigo adjacente."),
            A("lampejo", "Lampejo de Velmoor", "leaf", "free", 0, "flash", "Sem custo de ação: o próximo ataque do grupo rola o d20 duas vezes e fica com o melhor. 1x por descanso (o mesmo Lampejo que rerola testes).", per: "rest"),
        }.ToDictionary(a => a.key);

        /// <summary>An ability as this unit has it (the bow's range and damage come from the unit).</summary>
        public static Ability AbilityOf(Unit u, string key)
        {
            var ab = ABILITIES[key].Clone();
            if (key == "attack" && u.reach != 0) ab.range = u.reach;
            if (key == "shoot" && u.bow != null) { ab.range = u.bow.range; ab.name = $"Disparar ({u.bow.name})"; ab.desc = $"Ataque à distância: {u.bow.dmg} de dano, alcance {u.bow.range}."; }
            return ab;
        }
        public static List<Ability> AbilitiesOf(Unit u) => u.abilities.Select(k => AbilityOf(u, k)).ToList();
        public static bool IsFriendly(Ability ab) => ab.kind == "heal" || ab.kind == "potion" || ab.kind == "layhands" || ab.kind == "inspire";

        static bool CanUse(Unit u, Ability ab)
        {
            if (ab.cost == "action" && u.action == 0) return false;
            if (ab.cost == "bonus" && u.bonus == 0) return false;
            if (ab.per == "combat" && u.used.Contains(ab.key)) return false;
            if (ab.per == "rest" && u.restUsed.Contains(ab.key)) return false;
            if (ab.slot && u.slots <= 0) return false;
            if (ab.kind == "potion" && G.potions <= 0) return false;
            if (ab.kind == "flurry" && !u.attackedThisTurn) return false;
            return true;
        }

        // ---------------------------------------------------------------- start / end
        public static void StartCombat(Group group)
        {
            if (G.mode == "combat") return;
            var enemies = group.Where(e => e.hp > 0).ToList();
            if (enemies.Count == 0) return;
            G.mode = "combat";
            // stop everyone and snap them onto tiles
            var taken = new HashSet<int>();
            void Snap(Unit u)
            {
                u.path.Clear();
                var t = TileOf(u); int tx = t.x, ty = t.y;
                bool Ok(int x, int y) => !G.W.Blocked(x, y) && !taken.Contains(y * MW + x);
                if (!Ok(tx, ty))
                {
                    bool found = false;
                    for (int r = 1; r < 5 && !found; r++) for (int dy = -r; dy <= r && !found; dy++) for (int dx = -r; dx <= r && !found; dx++) if (Ok(tx + dx, ty + dy)) { tx += dx; ty += dy; found = true; }
                }
                taken.Add(ty * MW + tx);
                var c = TileCenter(tx, ty); u.x = c.x; u.y = c.y;
            }
            var party = G.party.Where(p => p.hp > 0).ToList();
            party.ForEach(Snap); enemies.ForEach(Snap);
            var order = party.Concat(enemies).Select(u => (u, init: U.RollDie(20) + u.dex)).ToList();
            order.Sort((a, b) => b.init - a.init);
            G.combat = new CombatState { order = order.Select(o => o.u).ToList(), group = group };
            foreach (var u in G.combat.order) u.used.Clear();
            Hud.Log("<b>Combate!</b> Iniciativa: " + string.Join(", ", order.Select(o => $"{o.u.name} {o.init}")), "sys");
            Hud.Banner("Combate");
            Snd.combatStart();
            Game.OnCombatStart();
            Game.After(0.9f, () => NextTurn().Forget());
        }

        static bool CheckEnd()
        {
            var C = G.combat;
            if (!C.group.Any(e => e.hp > 0))
            {
                int xp = C.group.Sum(e => e.xpValue);
                G.mode = "explore";
                G.combat = null;
                foreach (var p in G.party) if (p.hp <= 0) { p.hp = 1; Hud.Floater(p.x, p.y - 36, "De pé!", "info"); }
                foreach (var p in G.party) { p.raging = p.smiteNext = p.inspired = p.mocked = false; p.marked = null; }
                Hud.Toast($"Vitória!  +{xp} XP");
                Snd.victory();
                Hud.Log($"Vitória. Cada um recebe {xp} XP.", "sys");
                foreach (var p in G.party.ToList()) Game.GainXp(p, xp);
                Game.OnCombatEnd(C.group);
                return true;
            }
            if (!G.party.Any(p => p.hp > 0))
            {
                G.mode = "over";
                Game.GameOver();
                return true;
            }
            return false;
        }

        static async Task NextTurn()
        {
            var C = G.combat;
            if (C == null || CheckEnd()) return;
            int prev = C.idx;
            do { C.idx = (C.idx + 1) % C.order.Count; } while (C.order[C.idx].hp <= 0 || C.order[C.idx].gone);
            if (C.idx <= prev || prev < 0) C.round++;
            var u = C.active = C.order[C.idx];
            u.moveLeft = u.move; u.action = 1; u.bonus = 1; u.sneakUsed = false; u.attackedThisTurn = false;
            C.ability = null;
            // the story can step in at the start of a turn (allies arriving, a voice that stops time)
            C.busy = true;
            await Story.TurnStart(u, C);
            C.busy = false;
            if (G.combat != C || CheckEnd()) return;
            if (u.hp <= 0 || u.gone) { await NextTurn(); return; }
            if (u.skip > 0)
            {
                u.skip--;
                Hud.Floater(u.x, u.y - 40, u.skipNote ?? "Surpreso!", "info");
                Hud.Log($"{u.name} perde o turno.", "sys");
                C.busy = true; Hud.BuildHotbar(new List<Hud.Slot>());
                await Game.Sleep(700);
                C.busy = false;
                if (G.combat == C) await NextTurn();
                return;
            }
            if (u.forgotten)
            {
                u.forgotten = false; u.bonus = 0;
                Hud.Floater(u.x, u.y - 40, "Esquecido", "info");
                Hud.Log($"{u.name} esqueceu o que ia fazer: sem ação bônus neste turno.", "miss");
            }
            if (u.team == "party" && !u.ai)
            {
                Snd.turn();
                G.focus = u;
                RefreshCombatHotbar();
            }
            else
            {
                Hud.BuildHotbar(new List<Hud.Slot>());
                C.busy = true;
                await Game.Sleep(450);
                await AiTurn(u);
                C.busy = false;
                if (G.combat != null) await NextTurn();
            }
        }

        public static void EndTurn()
        {
            var C = G.combat;
            if (C == null || C.busy || C.active?.team != "party") return;
            Hud.Tooltip(null);
            NextTurn().Forget();
        }

        public static void RefreshCombatHotbar()
        {
            var C = G.combat; var u = C?.active;
            if (u == null || u.team != "party") return;
            var entries = AbilitiesOf(u).Select(ab => new Hud.Slot
            {
                icon = ab.icon, name = ab.name, desc = ab.desc,
                off = !CanUse(u, ab) || C.busy,
                sel = C.ability == ab.key,
                count = ab.slot ? u.slots : ab.kind == "potion" ? G.potions : (int?)null,
                use = () => SelectAbility(ab.key),
            }).ToList();
            Hud.BuildHotbar(entries, combat: true);
        }

        public static void SelectAbility(string key)
        {
            var C = G.combat;
            if (C == null || C.busy) return;
            var u = C.active; var ab = AbilityOf(u, key);
            Snd.select();
            if (!CanUse(u, ab)) return;
            if (ab.kind == "self" || ab.kind == "dash" || ab.kind == "flash" || ab.kind == "rage" || ab.kind == "smite") { UseAbility(u, ab, u).Forget(); return; }
            if (ab.kind == "cleave") { UseAbility(u, ab, null).Forget(); return; }
            C.ability = C.ability == key ? null : key;
            RefreshCombatHotbar();
        }

        // ---------------------------------------------------------------- player input
        static Unit TargetAt(int tx, int ty) => G.enemies.Concat(G.party).FirstOrDefault(e => e.hp > 0 && TileOf(e).x == tx && TileOf(e).y == ty);

        public static void CombatHover(int tx, int ty)
        {
            var C = G.combat;
            if (C == null || C.busy || C.active?.team != "party") { if (C != null) C.preview = null; return; }
            var u = C.active;
            var target = TargetAt(tx, ty);
            string abKey = C.ability ?? (target != null && target.team == "enemy" ? "attack" : null);
            C.preview = null;
            if (abKey != null && target != null)
            {
                var ab = AbilityOf(u, abKey);
                int d = Cheb(u, target);
                bool friendly = IsFriendly(ab);
                if (friendly != (target.team == "party")) { Hud.Tooltip(null); return; }
                if (ab.kind == "attack" || ab.kind == "bolt" || ab.kind == "shoot")
                {
                    int bonus = ab.kind == "shoot" ? u.bow.atk : ab.kind == "bolt" ? u.spellAtk ?? u.atk : u.atk;
                    int pct = HitChance(u, target, bonus);
                    bool inRange = d <= ab.range;
                    string note = "";
                    if (!inRange && ab.kind == "attack")
                    {
                        var app = ApproachTile(u, target);
                        note = app != null ? $"\nvai até ele ({app.Count} de movimento)" : "\n<color=#ff8a7a>longe demais</color>";
                        if (app != null) C.preview = app;
                    }
                    else if (!inRange) note = "\n<color=#ff8a7a>fora de alcance</color>";
                    Hud.Tooltip($"<b>{ab.name}</b> → {target.name}\n<size=20><color=#ffffff>{pct}%</color></size> de acerto · {(ab.kind == "bolt" ? ab.dmg : ab.kind == "shoot" ? u.bow.dmg : u.dmg)} dano{(u.marked == target ? " +1d6 (marca)" : "")}\nPV {target.hp}/{target.maxHp} · CA {target.ac}{note}");
                }
                else if (ab.kind == "missiles") Hud.Tooltip($"<b>{ab.name}</b> → {target.name}\n<size=20><color=#ffffff>100%</color></size> · 3×(1d4+1){(d > ab.range ? "\nfora de alcance" : "")}");
                else if (ab.kind == "mark") Hud.Tooltip($"<b>{ab.name}</b> → {target.name}\n+1d6 nos seus ataques com arma{(d > ab.range ? "\nfora de alcance" : "")}");
                else if (friendly) Hud.Tooltip($"<b>{ab.name}</b> → {target.name}\nPV {target.hp}/{target.maxHp}{(d > ab.range ? "\nfora de alcance" : "")}");
                else Hud.Tooltip($"<b>{ab.name}</b> → {target.name}{(d > ab.range ? "\n<color=#ff8a7a>fora de alcance</color>" : "")}");
                return;
            }
            Hud.Tooltip(target != null ? $"<b>{target.name}</b>\nPV {target.hp}/{target.maxHp} · CA {target.ac}" : null);
            if (C.ability != null) return;
            var ut = TileOf(u);
            var reach = PathFind.Reachable(BlockedFor(u), ut.x, ut.y, u.moveLeft);
            if (reach.ContainsKey(ty * MW + tx) && !(tx == ut.x && ty == ut.y)) C.preview = PathFind.GridPath(BlockedFor(u), ut.x, ut.y, tx, ty);
        }

        static List<Vector2Int> ApproachTile(Unit u, Unit target)
        {
            var ut = TileOf(u); var tt = TileOf(target);
            var reach = PathFind.Reachable(BlockedFor(u), ut.x, ut.y, u.moveLeft);
            Vector2Int? best = null; int bd = int.MaxValue;
            for (int dy = -1; dy <= 1; dy++)
                for (int dx = -1; dx <= 1; dx++)
                {
                    if (dx == 0 && dy == 0) continue;
                    int nx = tt.x + dx, ny = tt.y + dy, k = ny * MW + nx;
                    if (!reach.TryGetValue(k, out var d)) continue;
                    if (best == null || d < bd) { best = new Vector2Int(nx, ny); bd = d; }
                }
            if (best == null) return null;
            return PathFind.GridPath(BlockedFor(u), ut.x, ut.y, best.Value.x, best.Value.y);
        }

        public static async void CombatClick(int tx, int ty)
        {
            var C = G.combat;
            if (C == null || C.busy || C.active?.team != "party") return;
            var u = C.active;
            var target = TargetAt(tx, ty);
            string abKey = C.ability ?? (target != null && target.team == "enemy" ? "attack" : null);
            if (abKey != null && target != null)
            {
                var ab = AbilityOf(u, abKey);
                if (!CanUse(u, ab)) { Hud.Floater(u.x, u.y - 36, ab.cost == "bonus" ? "Sem ação bônus" : "Sem ação", "info"); return; }
                bool friendly = IsFriendly(ab);
                if (friendly != (target.team == "party")) return;
                if (Cheb(u, target) > ab.range)
                {
                    if (ab.kind != "attack") { Hud.Floater(u.x, u.y - 36, "Fora de alcance", "info"); return; }
                    var app = ApproachTile(u, target);
                    if (app == null) { Hud.Floater(u.x, u.y - 36, "Longe demais", "info"); return; }
                    C.busy = true; RefreshCombatHotbar();
                    await MoveAlong(u, app);
                    C.busy = false;
                }
                await UseAbility(u, ab, target);
                return;
            }
            if (C.ability != null) { C.ability = null; RefreshCombatHotbar(); return; }
            var ut = TileOf(u);
            var reach = PathFind.Reachable(BlockedFor(u), ut.x, ut.y, u.moveLeft);
            if (!reach.ContainsKey(ty * MW + tx) || (tx == ut.x && ty == ut.y)) return;
            var path = PathFind.GridPath(BlockedFor(u), ut.x, ut.y, tx, ty);
            C.busy = true; C.preview = null; RefreshCombatHotbar();
            await MoveAlong(u, path);
            C.busy = false;
            RefreshCombatHotbar();
        }

        static Task MoveAlong(Unit u, List<Vector2Int> path)
        {
            // an empty path never "arrives", so resolve it here or the turn hangs
            if (path == null || path.Count == 0) return Task.CompletedTask;
            u.moveLeft -= path.Count;
            var tcs = new TaskCompletionSource<bool>();
            u.path = path.Select(p => TileCenter(p.x, p.y)).ToList();
            u.onArrive = () => tcs.TrySetResult(true);
            u.speed = 120;
            return tcs.Task;
        }

        // ---------------------------------------------------------------- resolution
        static void Face(Unit u, Unit t)
        {
            float dx = t.x - u.x, dy = t.y - u.y;
            u.dir = Mathf.Abs(dx) > Mathf.Abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
        }
        static void Lunge(Unit u, Unit t)
        {
            Face(u, t);
            u.pose = "attack"; u.poseT = 0.35f;
            float dx = t.x - u.x, dy = t.y - u.y, l = Mathf.Max(1e-3f, Mathf.Sqrt(dx * dx + dy * dy));
            u.lunge = new Offset { x = dx / l * 5, y = dy / l * 5, t = 0.25f };
        }

        static void Damage(Unit t, int amount, bool crit, Unit src, string kind = "blade")
        {
            amount = Math.Max(1, amount);
            if (t.fireRes && (kind == "fire" || kind == "ember")) { amount = Math.Max(1, amount >> 1); Hud.Floater(t.x, t.y - 48, "Resistente", "info"); }
            if (t.raging && (kind == "blade" || kind == "arrow")) amount = Math.Max(1, amount >> 1);
            t.hp -= amount;
            if (t.hp <= 0 && t.relentless && !t.restUsed.Contains("relentless")) { t.hp = 1; t.restUsed.Add("relentless"); Game.After(0.2f, () => Hud.Floater(t.x, t.y - 50, "Implacável!", "crit")); }
            t.flashT = 0.16f;
            float dx = t.x - src.x, dy = t.y - src.y, l = Mathf.Max(1e-3f, Mathf.Sqrt(dx * dx + dy * dy));
            t.knock = new Offset { x = dx / l * 3, y = dy / l * 3, t = 0.2f };
            Hud.Floater(t.x, t.y - 34, crit ? amount + "!" : amount.ToString(), crit ? "crit" : "dmg");
            G.shake = crit ? 0.3f : 0.12f;
            G.hitstop = crit ? 0.12f : 0.06f;
            Snd.hit(crit, kind);
            if (t.hp <= 0)
            {
                t.hp = 0;
                if (t.team == "enemy")
                {
                    Game.After(0.25f, () => { G.fx.Spawn(FxKind.Poof, t.x, t.y); t.gone = true; });
                    Hud.Log(t.yields ? $"{t.name} recua, ferida." : $"{t.name} cai.", "sys");
                    Snd.enemyDown();
                }
                else
                {
                    Hud.Floater(t.x, t.y - 46, "Caído", "info");
                    Hud.Log($"{t.name} está caído!", "miss");
                    Snd.partyDown();
                    Story.PartyDown(t);
                }
            }
        }

        static void Heal(Unit t, int amount)
        {
            t.hp = Math.Min(t.maxHp, t.hp + amount);
            Hud.Floater(t.x, t.y - 34, "+" + amount, "heal");
        }

        struct AttackRes { public int d, total; public bool crit, hit; }
        static AttackRes AttackRoll(Unit u, Unit t, int bonus)
        {
            int d = U.RollDie(20);
            if (d == 1 && u.lucky) { d = U.RollDie(20); Hud.Floater(u.x, u.y - 46, "Sortudo!", "info"); }
            if (u.team == "party" && G.advNext) { G.advNext = false; int d2 = U.RollDie(20); if (d2 > d) d = d2; Hud.Floater(u.x, u.y - 52, "Lampejo!", "crit"); }
            int total = d + bonus;
            if (u.inspired) { u.inspired = false; int i = U.RollDie(6); total += i; Hud.Floater(u.x, u.y - 52, $"Inspiração +{i}", "info"); }
            if (u.mocked) { u.mocked = false; total -= 5; Hud.Floater(u.x, u.y - 52, "Abalado −5", "info"); }
            bool crit = d >= (u.critMin == 0 ? 20 : u.critMin), hit = crit || (d != 1 && total >= t.ac);
            return new AttackRes { d = d, total = total, crit = crit, hit = hit };
        }

        static U.RollResult RollDmg(string expr, bool crit)
        {
            var r = U.Roll(expr);
            if (crit) { var r2 = U.Roll(U.DiceOnly(expr)); r.total += r2.total; r.rolls.AddRange(r2.rolls); }
            r.mod = U.DiceMod(expr);
            return r;
        }

        /// <summary>Extra weapon damage: Hunter's Mark, Sneak Attack (an ally next to the target), Savage Attacks on a crit.</summary>
        static (int add, string note) WeaponExtras(Unit u, Unit t, bool crit, bool melee)
        {
            int add = 0;
            var notes = new List<string>();
            int Dice(int n) => U.Roll($"{(crit ? 2 : 1)}d{n}").total;
            if (u.marked == t) { int v = Dice(6); add += v; notes.Add($"marca +{v}"); }
            if (u.sneak && !u.sneakUsed && G.party.Any(p => p != u && p.hp > 0 && Cheb(p, t) <= 1))
            {
                u.sneakUsed = true;
                int v = Dice(6); add += v; notes.Add($"furtivo +{v}");
                Hud.Floater(t.x, t.y - 50, "Ataque furtivo!", "crit");
            }
            if (melee && crit && u.savage) { int v = U.Roll(U.DiceOnly(u.dmg)).total; add += v; notes.Add($"selvagem +{v}"); }
            if (melee && u.raging) { add += 2; notes.Add("fúria +2"); }
            if (melee && u.smiteNext) { u.smiteNext = false; int v = Dice(8) + Dice(8); add += v; notes.Add($"golpe divino +{v}"); Hud.Floater(t.x, t.y - 50, "Golpe Divino!", "crit"); G.fx.Spawn(FxKind.Bloom, t.x, t.y + 2, PAL.holy); }
            if (melee && u.wfx?.vsForgotten != null && t.esvaido) { int v = U.Roll(u.wfx.vsForgotten).total; add += v; notes.Add($"prata +{v}"); }
            return (add, notes.Count > 0 ? $" [{string.Join(", ", notes)}]" : "");
        }

        static async Task MeleeAttack(Unit u, Unit t, string expr)
        {
            u.attackedThisTurn = true;
            Lunge(u, t);
            bool flip = t.x < u.x;
            await Game.Sleep(120);
            var r = AttackRoll(u, t, u.atk);
            G.fx.Spawn(FxKind.SwordSlash, new FxOpts { x = t.x + (flip ? 14 : -14), y = t.y + 2, flip = flip, radius = 24 });
            Snd.swing();
            await Game.Sleep(110);
            if (r.hit)
            {
                var dm = RollDmg(expr, r.crit); var ex = u.team == "party" ? WeaponExtras(u, t, r.crit, true) : (0, "");
                G.fx.Spawn(r.crit ? FxKind.CritHit : FxKind.HitSpark, new FxOpts { x = t.x, y = t.y - 14, flip = flip });
                Damage(t, dm.total + ex.Item1, r.crit, u);
                Hud.Log($"{u.name} → {t.name}: d20 {r.d}+{u.atk}={r.total} vs CA {t.ac} · <b>{(r.crit ? "CRÍTICO" : "acerto")}</b> {dm.total + ex.Item1} ({FmtRoll(dm)}){ex.Item2}", r.crit ? "crit" : "hit");
            }
            else
            {
                Hud.Floater(t.x, t.y - 34, "Errou", "miss");
                Snd.miss();
                Hud.Log($"{u.name} → {t.name}: d20 {r.d}+{u.atk}={r.total} vs CA {t.ac} · errou", "miss");
            }
            await Game.Sleep(380);
        }

        static string SoundKind(Col[] palette) => palette == PAL.fire ? "fire" : palette == PAL.arcane || palette == PAL.holy ? "arcane" : palette == PAL.wood ? "arrow" : "ember";

        static Task Bolt(Unit u, Unit t, Col[] palette, Action onHit, float arc = 0, float? dur = null)
        {
            var tcs = new TaskCompletionSource<bool>();
            float sx = u.x, sy = u.y - 18, ex = t.x, ey = t.y - 14;
            float ang = Mathf.Atan2(ey - sy, ex - sx);
            float d = Mathf.Sqrt((ex - sx) * (ex - sx) + (ey - sy) * (ey - sy)); string kind = SoundKind(palette);
            Snd.cast(kind);
            G.fx.Spawn(FxKind.Fireball, new FxOpts { x = sx, y = sy, angle = ang, palette = palette, radius = 4 },
                new FxMove { x = ex, y = ey, dur = dur ?? Mathf.Max(0.18f, d / 420), arc = arc },
                () => { G.fx.Spawn(FxKind.HitSpark, new FxOpts { x = ex, y = ey, palette = palette, flip = ex < sx }); Snd.impact(kind); onHit(); tcs.TrySetResult(true); });
            return tcs.Task;
        }

        static async Task RangedSpell(Unit u, Unit t, string expr, Col[] palette, string label, int bonus, bool weapon = false, string effect = null)
        {
            Face(u, t);
            bool arrow = SoundKind(palette) == "arrow";
            u.pose = "cast"; u.poseT = arrow ? 0.85f : 0.5f;
            if (arrow) Snd.bowDraw(0.5); // draw the bow before letting go
            await Game.Sleep(arrow ? 560 : 200);
            var r = AttackRoll(u, t, bonus);
            await Bolt(u, t, palette, () =>
            {
                if (r.hit)
                {
                    var dm = RollDmg(expr, r.crit); var ex = weapon ? WeaponExtras(u, t, r.crit, false) : (0, "");
                    int add = ex.Item1; string note = ex.Item2;
                    if (!weapon && u.markSpells && u.marked == t) { int v = U.Roll("1d6").total; add += v; note += $" [maldição +{v}]"; }
                    if (!weapon && palette == PAL.fire && u.wfx != null && u.wfx.fireBonus != 0) { add += u.wfx.fireBonus; note += $" [cajado +{u.wfx.fireBonus}]"; }
                    if (effect == "mock" && t.hp > 0) { t.mocked = true; Game.After(0.25f, () => Hud.Floater(t.x, t.y - 50, "Zombado", "info")); }
                    Damage(t, dm.total + add, r.crit, u, SoundKind(palette));
                    if (u.ranged != null && u.ranged.forget && t.hp > 0 && !t.forgetWard) { t.forgotten = true; Game.After(0.25f, () => Hud.Floater(t.x, t.y - 50, "Esquecido", "info")); }
                    Hud.Log($"{u.name} — {label} → {t.name}: d20 {r.d}+{bonus}={r.total} vs CA {t.ac} · <b>{(r.crit ? "CRÍTICO" : "acerto")}</b> {dm.total + add}{note}", r.crit ? "crit" : "hit");
                }
                else
                {
                    Hud.Floater(t.x, t.y - 34, "Errou", "miss");
                    Snd.miss();
                    Hud.Log($"{u.name} — {label} → {t.name}: d20 {r.d}+{bonus}={r.total} · errou", "miss");
                }
            });
            await Game.Sleep(350);
        }

        public static async Task UseAbility(Unit u, Ability ab, Unit target)
        {
            var C = G.combat;
            if (C == null) return;
            C.busy = true; C.ability = null; C.preview = null; Hud.Tooltip(null);
            RefreshCombatHotbar();
            if (ab.cost == "action") u.action = 0;
            if (ab.cost == "bonus") u.bonus = 0;
            if (ab.per == "combat") u.used.Add(ab.key);
            if (ab.per == "rest") u.restUsed.Add(ab.key);
            if (ab.slot) u.slots--;
            switch (ab.kind)
            {
                case "attack": await MeleeAttack(u, target, u.dmg); break;
                case "bolt": await RangedSpell(u, target, ab.dmg, PAL.ByName(ab.pal ?? "fire"), ab.name, u.spellAtk ?? u.atk, false, ab.effect); break;
                case "rage":
                    u.raging = true;
                    G.fx.Spawn(FxKind.Bloom, u.x, u.y + 2, PAL.ember);
                    Hud.Floater(u.x, u.y - 40, "FÚRIA!", "crit");
                    Hud.Log($"{u.name} entra em fúria: +2 de dano corpo a corpo e metade do dano de armas.", "sys");
                    Snd.swing(true);
                    await Game.Sleep(400);
                    break;
                case "smite":
                    u.smiteNext = true;
                    G.fx.Spawn(FxKind.HitSpark, u.x, u.y - 20, PAL.holy);
                    Hud.Floater(u.x, u.y - 40, "Arma brilha", "info");
                    Snd.cast("arcane");
                    await Game.Sleep(350);
                    break;
                case "layhands":
                    Face(u, target);
                    u.pose = "cast"; u.poseT = 0.6f;
                    G.fx.Spawn(FxKind.Bloom, target.x, target.y + 2, PAL.holy);
                    Snd.heal();
                    await Game.Sleep(450);
                    Heal(target, 5 * u.level);
                    Hud.Log($"{u.name} impõe as mãos em {target.name}: +{5 * u.level} PV", "heal");
                    await Game.Sleep(300);
                    break;
                case "inspire":
                    Face(u, target);
                    u.pose = "cast"; u.poseT = 0.5f;
                    target.inspired = true;
                    G.fx.Spawn(FxKind.HitSpark, target.x, target.y - 18, PAL.gold);
                    Hud.Floater(target.x, target.y - 40, "Inspirado", "heal");
                    Hud.Log($"{u.name} inspira {target.name}: +1d6 no próximo ataque.", "sys");
                    Snd.cast("arcane");
                    await Game.Sleep(400);
                    break;
                case "entangle":
                    {
                        Face(u, target);
                        u.pose = "cast"; u.poseT = 0.6f;
                        G.fx.Spawn(FxKind.Bloom, target.x, target.y + 2, PAL.heal);
                        Snd.cast("arcane");
                        await Game.Sleep(450);
                        int dc = 8 + (u.spellAtk ?? 4), save = U.RollDie(20) + Math.Max(0, target.atk - 2);
                        if (save < dc) { target.skip++; target.skipNote = "Enredado"; Hud.Floater(target.x, target.y - 40, "Enredado!", "crit"); Hud.Log($"Raízes prendem {target.name} ({save} vs CD {dc}): perde o próximo turno.", "hit"); }
                        else { Hud.Floater(target.x, target.y - 40, "Se soltou", "miss"); Hud.Log($"{target.name} arrebenta as raízes ({save} vs CD {dc}).", "miss"); }
                        await Game.Sleep(350);
                        break;
                    }
                case "flurry":
                    for (int i = 0; i < 2 && target.hp > 0; i++) await MeleeAttack(u, target, u.unarmed ?? "1d4");
                    break;
                case "shoot": await RangedSpell(u, target, u.bow.dmg, PAL.wood, u.bow.name, u.bow.atk, true); break;
                case "flash":
                    G.advNext = true;
                    G.fx.Spawn(FxKind.Bloom, u.x, u.y + 2, PAL.arcane);
                    Hud.Floater(u.x, u.y - 40, "Lampejo de Velmoor", "crit");
                    Hud.Log($"{u.name} acende o Lampejo: o próximo ataque do grupo rola com vantagem.", "sys");
                    Snd.cast("arcane");
                    await Game.Sleep(400);
                    break;
                case "dash":
                    u.moveLeft += u.move;
                    Hud.Floater(u.x, u.y - 36, $"+{u.move} movimento", "info");
                    Snd.miss();
                    await Game.Sleep(250);
                    break;
                case "mark":
                    Face(u, target);
                    u.pose = "cast"; u.poseT = 0.4f;
                    u.marked = target;
                    G.fx.Spawn(FxKind.HitSpark, target.x, target.y - 14, PAL.gold);
                    Snd.cast("arcane");
                    Hud.Floater(target.x, target.y - 40, "Marcado", "info");
                    Hud.Log($"{u.name} marca {target.name}: +1d6 nos ataques com arma.", "sys");
                    await Game.Sleep(350);
                    break;
                case "missiles":
                    {
                        Face(u, target);
                        u.pose = "cast"; u.poseT = 0.9f;
                        int tot = 0;
                        var shots = new List<Task>();
                        for (int i = 0; i < 3; i++)
                        {
                            int k = i;
                            shots.Add(Shot(k));
                        }
                        async Task Shot(int i)
                        {
                            await Game.Sleep(i * 160);
                            await Bolt(u, target, PAL.arcane, () =>
                            {
                                if (target.hp <= 0) return;
                                var r = U.Roll("1d4+1"); tot += r.total; Damage(target, r.total, false, u, "arcane");
                            }, 26 * (i - 1), 0.42f);
                        }
                        await Task.WhenAll(shots);
                        Hud.Log($"{u.name} — Mísseis Mágicos → {target.name}: {tot} de dano", "hit");
                        await Game.Sleep(300);
                        break;
                    }
                case "heal":
                    {
                        Face(u, target);
                        u.pose = "cast"; u.poseT = 0.6f;
                        G.fx.Spawn(FxKind.Bloom, target.x, target.y + 2);
                        Snd.heal();
                        await Game.Sleep(500);
                        int cm = u.castMod + (u.wfx?.healBonus ?? 0);
                        var r = U.Roll($"{ab.heal ?? "1d8"}{(cm < 0 ? "" : "+")}{cm}"); Heal(target, Math.Max(1, r.total));
                        Hud.Log($"{u.name} cura {target.name}: +{r.total} PV", "heal");
                        await Game.Sleep(400);
                        break;
                    }
                case "potion":
                    {
                        G.potions--;
                        G.fx.Spawn(FxKind.Bloom, target.x, target.y + 2, PAL.heal);
                        Snd.potion();
                        await Game.Sleep(350);
                        var r = U.Roll("2d4+2"); Heal(target, r.total);
                        Hud.Log($"{target.name} bebe uma poção: +{r.total} PV", "heal");
                        await Game.Sleep(300);
                        break;
                    }
                case "self":
                    {
                        var r = U.Roll($"1d10+{u.level}");
                        G.fx.Spawn(FxKind.Bloom, u.x, u.y + 2, PAL.holy);
                        Snd.breath();
                        await Game.Sleep(400);
                        Heal(u, r.total);
                        Hud.Log($"{u.name} retoma o fôlego: +{r.total} PV", "heal");
                        break;
                    }
                case "cleave":
                    {
                        var adj = G.enemies.Where(e => e.hp > 0 && Cheb(u, e) <= 1).ToList();
                        u.pose = "attack"; u.poseT = 0.5f;
                        G.fx.Spawn(FxKind.SwordSlash, new FxOpts { x = u.x - 12, y = u.y + 2, flip = true, radius = 24 });
                        G.fx.Spawn(FxKind.SwordSlash, new FxOpts { x = u.x + 12, y = u.y + 2, radius = 24 });
                        Snd.swing(true);
                        await Game.Sleep(200);
                        if (adj.Count == 0) Hud.Floater(u.x, u.y - 36, "Ninguém ao redor", "info");
                        foreach (var t in adj)
                        {
                            var r = AttackRoll(u, t, u.atk);
                            if (r.hit) { var dm = RollDmg(u.dmg, r.crit); G.fx.Spawn(FxKind.HitSpark, new FxOpts { x = t.x, y = t.y - 14, flip = t.x < u.x }); Damage(t, dm.total, r.crit, u); Hud.Log($"Golpe Giratório → {t.name}: {dm.total}", "hit"); }
                            else { Hud.Floater(t.x, t.y - 34, "Errou", "miss"); Hud.Log($"Golpe Giratório → {t.name}: errou", "miss"); }
                            await Game.Sleep(120);
                        }
                        await Game.Sleep(350);
                        break;
                    }
            }
            if (G.combat == null) return;
            C.busy = false;
            if (CheckEnd()) return;
            RefreshCombatHotbar();
        }

        // ---------------------------------------------------------------- AI (enemies, and allies who fight on their own)
        static async Task AiTurn(Unit u)
        {
            var C = G.combat;
            if (u.noncombat) { await Game.Sleep(300); return; }
            var foes = (u.team == "enemy" ? G.party.Where(p => p.hp > 0) : C.group.Where(e => e.hp > 0 && !e.gone)).Where(f => f.key == null || f.key != u.spare).ToList();
            if (foes.Count == 0) return;
            var byDist = foes.Select(f => (f, d: Cheb(u, f))).OrderBy(o => o.d).ThenBy(o => o.f.hp).ToList();
            G.focus = u;
            if (u.ranged != null)
            {
                // prefer the most wounded target in range; keep a step away from blades
                var inRange = byDist.Where(o => o.d <= u.ranged.range).ToList();
                if (byDist[0].d <= 1)
                {
                    var ut = TileOf(u); var reach = PathFind.Reachable(BlockedFor(u), ut.x, ut.y, u.moveLeft);
                    (int tx, int ty, int d)? best = null;
                    foreach (var k in reach.Keys)
                    {
                        int tx = k % MW, ty = k / MW;
                        int dmin = foes.Min(f => { var ft = TileOf(f); return Math.Max(Math.Abs(ft.x - tx), Math.Abs(ft.y - ty)); });
                        if (dmin >= 3 && (best == null || dmin > best.Value.d)) best = (tx, ty, dmin);
                    }
                    if (best != null) await MoveAlong(u, PathFind.GridPath(BlockedFor(u), ut.x, ut.y, best.Value.tx, best.Value.ty));
                }
                var pick = (inRange.Count > 0 ? inRange : byDist).OrderBy(o => o.f.hp).First().f;
                if (Cheb(u, pick) > u.ranged.range)
                {
                    var ut = TileOf(u); var pt = TileOf(pick);
                    var p = PathFind.GridPath(BlockedFor(u), ut.x, ut.y, pt.x, pt.y);
                    if (p != null) await MoveAlong(u, p.Take(Math.Min(u.moveLeft, Math.Max(0, p.Count - u.ranged.range))).ToList());
                }
                if (Cheb(u, pick) <= u.ranged.range) await RangedSpell(u, pick, u.ranged.dmg, u.ranged.pal ?? PAL.ember, u.ranged.name, u.atk);
                return;
            }
            var target = byDist[0].f;
            if (byDist[0].d > 1)
            {
                // walk toward the closest reachable foe
                List<Vector2Int> app = null;
                foreach (var o in byDist) { app = ApproachTile(u, o.f); if (app != null) { target = o.f; break; } }
                if (app != null) await MoveAlong(u, app);
                else
                {
                    var ut = TileOf(u); var tt = TileOf(target);
                    var p = PathFind.GridPath((x, y) => G.W.Blocked(x, y) || (OccupiedBy(x, y, u) != null && !(x == tt.x && y == tt.y)), ut.x, ut.y, tt.x, tt.y);
                    if (p != null) await MoveAlong(u, p.Take(Math.Min(u.moveLeft, p.Count - 1)).ToList());
                }
            }
            if (Cheb(u, target) <= 1) await MeleeAttack(u, target, u.dmg);
        }
    }
}
