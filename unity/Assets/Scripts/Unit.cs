// Everyone who stands on the map: the party, enemies, NPCs, followers. The JS kept these as loose objects;
// here every field the game or the story ever sets has a name.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Brumafolha
{
    public interface ISpeaker { string SpName { get; } Img SpPortrait { get; } }
    public class Speaker : ISpeaker
    {
        public string name; public Img portrait;
        public Speaker(string name, Img portrait) { this.name = name; this.portrait = portrait; }
        public string SpName => name;
        public Img SpPortrait => portrait;
    }

    public class Glow { public float r, a = 0.35f, h = 16; public Color32 c = new Color32(150, 190, 255, 255); }
    public class RangedAtk { public int range; public string dmg, name; public Col[] pal; public bool forget; }
    public class Offset { public float x, y, t; }

    public class Unit : ISpeaker
    {
        // who
        public string key, name, cls, team = "npc", role, gender, label, group, spare;
        public Build build; public Equip equip; public Spec spec;
        public CharSheet ch; public Img portrait;
        // where and how they're drawn
        public float x, y, speed = 82, animT, poseT, flashT, alert;
        public int dir, tx, ty;
        public string pose = "idle";
        public List<Vector2> path = new List<Vector2>();
        public bool moving, hidden, gone, ghost, @fixed, gesture, small;
        public int @float;
        public float? alpha;
        public Glow glow;
        public Offset lunge, knock;
        public Action onArrive;
        public Func<DTree> talk;
        // numbers
        public int hp, maxHp = 1, hpPerLevel, level = 1, xp, nextXp = 300, ac = 10, atk, move = 6, dex, reach = 1, castMod;
        public int slots, maxSlots, slotBonus, bonusAtk, critMin = 20, xpValue;
        public int? spellAtk;
        public string dmg = "1d4", unarmed;
        public Bow bow;
        public RangedAtk ranged;
        public GearFx wfx = new GearFx();
        public Dictionary<string, int> skills = new Dictionary<string, int>();
        public List<string> abilities = new List<string>();
        public HashSet<string> used = new HashSet<string>(), restUsed = new HashSet<string>();
        // traits and conditions
        public bool sneak, markSpells, lucky, relentless, savage, fireRes, forgetWard, ai, noncombat, passive, boss, yields, esvaido;
        public bool raging, smiteNext, inspired, mocked, forgotten;
        public Unit marked;
        public int skip; public string skipNote;
        // the turn in progress
        public int moveLeft, action, bonus; public bool sneakUsed, attackedThisTurn;
        // footsteps
        public float? sx, sy; public float stepAcc;

        public string SpName => name;
        public Img SpPortrait => portrait;
        public int Tx => Mathf.FloorToInt(x / U.TILE);
        public int Ty => Mathf.FloorToInt((y - 1) / U.TILE);
    }
}
