// The one shared game state, so modules don't reach into each other. Ported from src/state.js.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace Brumafolha
{
    /// <summary>Story flags. The JS kept them on a loose object and tested them for truthiness; this keeps that.</summary>
    public class Flags
    {
        readonly Dictionary<string, object> d = new Dictionary<string, object>();
        public bool B(string k) { if (!d.TryGetValue(k, out var v) || v == null) return false; return v switch { bool b => b, int i => i != 0, float f => f != 0, double x => x != 0, string s => s.Length > 0, _ => true }; }
        public bool Has(string k) => d.TryGetValue(k, out var v) && v != null; // JS "!= null"
        public string S(string k) => d.TryGetValue(k, out var v) ? v as string : null;
        public float N(string k) { if (!d.TryGetValue(k, out var v) || v == null) return 0; return v switch { float f => f, int i => i, double x => (float)x, bool b => b ? 1 : 0, _ => 0 }; }
        public void Set(string k, object v) => d[k] = v;
        public void On(params string[] ks) { foreach (var k in ks) d[k] = true; }
        public void Off(string k) => d[k] = false;
        public void Clear() => d.Clear();
        public Flags Clone() { var f = new Flags(); foreach (var kv in d) f.d[kv.Key] = kv.Value; return f; }
        public void CopyFrom(Flags o) { d.Clear(); foreach (var kv in o.d) d[kv.Key] = kv.Value; }
    }

    public class Memory { public string id, text; public bool origin, struck, flicker; public Memory Clone() => (Memory)MemberwiseClone(); }

    /// <summary>Where the camera looks in a cutscene: a fixed point, or something that moves (a unit, the boat).</summary>
    public class CamFocus
    {
        public Func<Vector2> pos; public float? speed;
        public static CamFocus At(float x, float y, float? speed = null) => new CamFocus { pos = () => new Vector2(x, y), speed = speed };
        public static CamFocus Follow(Func<Vector2> p) => new CamFocus { pos = p };
    }

    public class Origin { public string mentor, mentorName; }

    public static class G
    {
        public static string mode = "title"; // title | create | explore | cutscene | dialogue | combat | over | end
        public static bool paused;
        public static float time;
        public static Vector2 cam;
        public static int scale = 3, vw = 640, vh = 360;
        public static WorldMap W;
        public static List<Unit> party = new List<Unit>(), enemies = new List<Unit>(), npcs = new List<Unit>(), followers = new List<Unit>();
        public static List<Chest> chests = new List<Chest>();
        public static Dictionary<string, Group> groups = new Dictionary<string, Group>();
        public static int leader;
        public static int potions = 1, gold = 12;
        public static readonly Flags f = new Flags();
        public static List<Item> items = new List<Item>();
        public static List<Memory> memories = new List<Memory>();
        public static Dictionary<string, int> approval = new Dictionary<string, int>();
        public static CamFocus camFocus;
        public static bool tutorial; public static HashSet<string> hintsSeen = new HashSet<string>();
        public static float mouseX, mouseY, mwx, mwy; public static int mtx, mty; public static bool mouseIn;
        public static CombatState combat;
        public static FxLayer fx;
        public static float shake, hitstop;
        public static Unit focus, hero, mate, kael, lyra;
        public static Build build;
        public static float? speedCap;
        public static bool hasMusicOverride; public static string musicOverride;
        public static Color? tint;
        public static bool advNext, followLeader;
        public static Origin origin = new Origin();

        public static Unit Lead => leader >= 0 && leader < party.Count ? party[leader] : null;
        public static IEnumerable<Unit> AllUnits => party.Concat(enemies).Concat(npcs);
        public static void SetMusicOverride(string track) { hasMusicOverride = true; musicOverride = track; }
        public static void ClearMusicOverride() { hasMusicOverride = false; musicOverride = null; }
    }

    public static class TaskExt
    {
        /// <summary>Fire and forget, but don't swallow errors.</summary>
        public static async void Forget(this Task t) { try { await t; } catch (Exception e) { Debug.LogException(e); } }
    }
}
