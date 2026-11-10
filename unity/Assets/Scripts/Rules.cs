// Character rules, tabletop style: races, classes, point-buy ability scores, and everything derived from them
// (hit points, armour class, attack and damage, skills). Also the look options and the sprite spec they make.
// Ported from src/rules.js.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Brumafolha
{
    public class Look { public int skin = 1, hair, eyes, outfit, cape; public string style = "short", beard; public Look Clone() => (Look)MemberwiseClone(); }
    public class Equip
    {
        public string main, ranged, armor, shield;
        public Equip Clone() => (Equip)MemberwiseClone();
        public string this[string slot]
        {
            get => slot == "main" ? main : slot == "ranged" ? ranged : slot == "armor" ? armor : shield;
            set { if (slot == "main") main = value; else if (slot == "ranged") ranged = value; else if (slot == "armor") armor = value; else shield = value; }
        }
    }

    /// <summary>A character sheet before play: who they are, how they look, what they carry.</summary>
    public class Build
    {
        public string race, cls, gender, name;
        public Dictionary<string, int> @base;
        public Look look = new Look();
        public Equip equip = new Equip();
        public List<string> extraSkills = new List<string>(), extraAbilities = new List<string>();
        public Build Clone() => new Build { race = race, cls = cls, gender = gender, name = name, @base = new Dictionary<string, int>(@base), look = look.Clone(), equip = equip.Clone(), extraSkills = new List<string>(extraSkills), extraAbilities = new List<string>(extraAbilities) };
    }

    public class RaceDef
    {
        public string key, name, nameF, desc, ears = "human";
        public Dictionary<string, int> bonus;
        public Col[][] skins;
        public string[] skills = new string[0];
        public string[][] traits;
        public int init, hpPerLevel;
        public int? move;
        public bool stout, small, lucky, tusks, relentless, savage, horns, fireRes;
        public bool? blush;
        public string[] namesF, namesM;
        public int lookHair; public string lookBeard, lookStyle; public int? lookEyes;
    }

    public class ClassDef
    {
        public string key, name, nameF, desc, role, caster, unarmored;
        public int hitDie, slots, mageArmor;
        public bool monk, sneak, markSpells, showRanged;
        public int profArmor; public bool profMartial, profShield, profFinesseMartial; public string[] profExtra = new string[0];
        public string[] optMain, optRanged, optArmor; public bool[] optShield;
        public string[] abilities, skills;
        public Dictionary<string, int> scores;
        public int lookOutfit, lookCape; public string lookStyle;
    }

    public class Bow { public string name, dmg; public int atk, range; public Bow Clone() => (Bow)MemberwiseClone(); }

    public class Derived
    {
        public Dictionary<string, int> scores;
        public int maxHp, hpPerLevel, ac, atk, reach, castMod, maxSlots, move, init;
        public int? spellAtk;
        public string acNote, dmg, weaponStat, unarmed;
        public WeaponDef weapon;
        public Bow bow;
        public Dictionary<string, int> skills;
        public HashSet<string> proficient;
        public GearFx fx;
        public List<string> notes;
    }

    public static class Rules
    {
        public static readonly string[] ABILS = { "FOR", "DES", "CON", "INT", "SAB", "CAR" };
        public static readonly Dictionary<string, string> ABIL_NAMES = new Dictionary<string, string> { ["FOR"] = "Força", ["DES"] = "Destreza", ["CON"] = "Constituição", ["INT"] = "Inteligência", ["SAB"] = "Sabedoria", ["CAR"] = "Carisma" };
        public static int Mod(int score) => (int)Math.Floor((score - 10) / 2.0);
        const int PROF = 2;

        // point buy: every score starts at 8, 27 points to spend, 15 is the most you can buy
        public const int POINTS = 27, MIN_SCORE = 8, MAX_SCORE = 15;
        static readonly Dictionary<int, int> COST = new Dictionary<int, int> { [8] = 0, [9] = 1, [10] = 2, [11] = 3, [12] = 4, [13] = 5, [14] = 7, [15] = 9 };
        public static int PointsSpent(Dictionary<string, int> b) => ABILS.Sum(k => COST[b[k]]);
        public static bool CanRaise(Dictionary<string, int> b, string k) => b[k] < MAX_SCORE && PointsSpent(b) + COST[b[k] + 1] - COST[b[k]] <= POINTS;
        public static bool CanLower(Dictionary<string, int> b, string k) => b[k] > MIN_SCORE;

        public static readonly Dictionary<string, string> SKILLS = new Dictionary<string, string> {
            ["Atletismo"] = "FOR", ["Acrobacia"] = "DES", ["Furtividade"] = "DES", ["Prestidigitação"] = "DES", ["Arcanismo"] = "INT", ["História"] = "INT", ["Investigação"] = "INT", ["Natureza"] = "INT",
            ["Intuição"] = "SAB", ["Medicina"] = "SAB", ["Percepção"] = "SAB", ["Sobrevivência"] = "SAB", ["Enganação"] = "CAR", ["Intimidação"] = "CAR", ["Persuasão"] = "CAR", ["Atuação"] = "CAR",
        };

        // ---------------------------------------------------------------- looks
        static readonly Col[][] HUMAN_SKINS = {
            U.Ramp("#9a6a5a", "#d8a088", "#f4cdb0", "#ffe6d0"), U.Ramp("#8a4e3a", "#c47e5e", "#eab08a", "#f8d0b0"), U.Ramp("#7a4630", "#a86a48", "#d09468", "#ecb88a"),
            U.Ramp("#5e3e24", "#8e6440", "#b8885c", "#d8ac7c"), U.Ramp("#4a2a1a", "#704028", "#9a5e3c", "#bc8058"), U.Ramp("#2a1610", "#4a2a1c", "#6a4028", "#8a5838"),
        };
        static readonly Col[][] ORC_SKINS = {
            U.Ramp("#2e3e2a", "#4e6644", "#6e8a5c", "#90a878"), U.Ramp("#24401a", "#3e6a24", "#5a8e30", "#7cb040"),
            U.Ramp("#3a4a3e", "#5a6e5e", "#7e927e", "#a0b4a0"), U.Ramp("#4a4038", "#6e6256", "#928474", "#b4a694"),
        };
        static readonly Col[][] FIEND_SKINS = {
            U.Ramp("#4a1420", "#7a2432", "#a83a46", "#d0606a"), U.Ramp("#2e1a40", "#4a2a66", "#6a408a", "#8c5eae"),
            U.Ramp("#1a2a4a", "#2a4270", "#3e5e96", "#5a80b8"), U.Ramp("#5a2a3a", "#8a4458", "#b06478", "#d08898"),
        };
        public static readonly (string name, Col[] ramp)[] HAIR_COLORS = {
            ("Preto", U.Ramp("#141016", "#2a2228", "#40343a", "#5a4a4e")), ("Castanho", U.Ramp("#2a1610", "#4a2a1a", "#6e4026", "#90582e")),
            ("Ruivo", U.Ramp("#3a1a0e", "#7a3216", "#b0521e", "#d8803a")), ("Loiro", U.Ramp("#8a5a1a", "#b8802a", "#dca848", "#f0c868")),
            ("Platinado", U.Ramp("#8a8a90", "#b8b8bc", "#dcdce0", "#f4f4f6")), ("Lilás", U.Ramp("#3e3a6a", "#6a68a0", "#a0a2d4", "#dcdef6")),
            ("Corvo", U.Ramp("#14101c", "#2a2238", "#40345a", "#5a4c7a")), ("Carmim", U.Ramp("#4a0e0e", "#7a1a18", "#a8302a", "#d05040")),
        };
        public static readonly (string v, string label)[] HAIR_STYLES = { ("short", "Curto"), ("long", "Longo"), ("bun", "Coque"), ("mohawk", "Moicano"), ("bald", "Careca"), ("hood", "Capuz") };
        public static readonly (string v, string label)[] BEARDS = { (null, "Sem barba"), ("short", "Curta"), ("long", "Longa") };
        public static readonly (string name, Col c)[] EYES = {
            ("Escuros", new Col(20, 14, 20)), ("Castanhos", new Col(80, 44, 20)), ("Azuis", new Col(40, 100, 170)), ("Verdes", new Col(40, 120, 60)),
            ("Âmbar", new Col(230, 170, 40)), ("Rubros", new Col(210, 40, 40)), ("Violeta", new Col(130, 60, 180)), ("Glaciais", new Col(160, 220, 240)),
        };
        public static readonly (string name, Col[] ramp)[] OUTFITS = {
            ("Carmesim", U.Ramp("#3e1e1a", "#6a2e22", "#94442a", "#b8623a")), ("Floresta", U.Ramp("#1a2a14", "#2a4220", "#3e5e2c", "#567a3a")),
            ("Marinho", U.Ramp("#18283e", "#22405e", "#2e5a80", "#4278a0")), ("Arcano", U.Ramp("#1e1438", "#34205e", "#4e3288", "#6e4cb0")),
            ("Carvão", U.Ramp("#141418", "#24242c", "#383844", "#50505e")), ("Ocre", U.Ramp("#4a2a0a", "#7a4a14", "#a8701e", "#cc9634")),
            ("Turquesa", U.Ramp("#0e2a2a", "#1a4444", "#2a6262", "#3e8484")), ("Marfim", U.Ramp("#6a6050", "#9a9080", "#c8bea8", "#ece4d0")),
        };
        public static readonly (string name, Col[] ramp)[] CAPES = {
            ("Sem capa", null), ("Verde", U.Ramp("#16301e", "#244a2a", "#36663a", "#4c8248")), ("Rubra", U.Ramp("#3a0e10", "#5e1a1a", "#862828", "#a83a32")),
            ("Azul", U.Ramp("#141e38", "#1e2e56", "#2c4478", "#3e5c9a")), ("Negra", U.Ramp("#0e0c12", "#1a1820", "#2a2632", "#3c3846")), ("Dourada", U.Ramp("#4a2a0a", "#7a4a14", "#b07a1e", "#d8a83a")),
        };
        static readonly Col[] PANTS = U.Ramp("#1e1e2a", "#2e3040", "#43465a"), BOOTS = U.Ramp("#1a1010", "#3a2218", "#5a3622");

        static Dictionary<string, int> D(params (string, int)[] kv) => kv.ToDictionary(p => p.Item1, p => p.Item2);

        // ---------------------------------------------------------------- races
        public static readonly Dictionary<string, RaceDef> RACES = new List<RaceDef> {
            new RaceDef { key = "humano", name = "Humano", nameF = "Humana", desc = "Ambiciosos e adaptáveis, os humanos se espalharam por todo o vale.", bonus = D(("FOR", 1), ("DES", 1), ("CON", 1), ("INT", 1), ("SAB", 1), ("CAR", 1)),
                skins = HUMAN_SKINS, skills = new[] { "Persuasão" }, traits = new[] { new[] { "Versátil", "+1 em todos os atributos." }, new[] { "Lábia", "Proficiência em Persuasão." } },
                namesF = new[] { "Mirela", "Brisa", "Isolde", "Selene", "Ana", "Teodora" }, namesM = new[] { "Aldren", "Tavio", "Corvan", "Dario", "Bento", "Lauro" }, lookHair = 1 },
            new RaceDef { key = "elfo", name = "Elfo", nameF = "Elfa", desc = "Longevos e graciosos, com sentidos afiados pela floresta.", bonus = D(("DES", 2), ("SAB", 1)),
                skins = HUMAN_SKINS, ears = "elf", skills = new[] { "Percepção" }, traits = new[] { new[] { "Sentidos aguçados", "Proficiência em Percepção." }, new[] { "Passo leve", "+1 de iniciativa." } }, init = 1,
                namesF = new[] { "Aeris", "Sylwen", "Naeris", "Ithil", "Elowen", "Liria" }, namesM = new[] { "Lyrien", "Thalas", "Faelar", "Elandor", "Caelum", "Erevan" }, lookHair = 4, lookStyle = "long" },
            new RaceDef { key = "anao", name = "Anão", nameF = "Anã", desc = "Robustos como a pedra das montanhas, teimosos e leais.", bonus = D(("CON", 2), ("SAB", 1)),
                skins = HUMAN_SKINS, stout = true, move = 5, hpPerLevel = 1, traits = new[] { new[] { "Robustez anã", "+1 PV por nível." }, new[] { "Firme", "Deslocamento 5, mas não é derrubado fácil." } },
                namesF = new[] { "Hilda", "Dagna", "Brunna", "Ketta", "Sigrun", "Morna" }, namesM = new[] { "Borin", "Thrain", "Gimrik", "Torvald", "Durgan", "Hakon" }, lookHair = 2, lookBeard = "long" },
            new RaceDef { key = "halfling", name = "Halfling", desc = "Pequenos, alegres e misteriosamente sortudos.", bonus = D(("DES", 2), ("CAR", 1)),
                skins = HUMAN_SKINS, small = true, move = 5, lucky = true, traits = new[] { new[] { "Sortudo", "Rola de novo os 1 naturais no d20." }, new[] { "Pequeno", "Deslocamento 5." } },
                namesF = new[] { "Rosie", "Tansy", "Clover", "Poppy", "Mel", "Lila" }, namesM = new[] { "Pip", "Milo", "Bram", "Wendel", "Tico", "Fred" }, lookHair = 3 },
            new RaceDef { key = "meioorc", name = "Meio-orc", desc = "Fortes e intensos, com sangue orc correndo nas veias.", bonus = D(("FOR", 2), ("CON", 1)),
                skins = ORC_SKINS, tusks = true, blush = false, relentless = true, savage = true, skills = new[] { "Intimidação" },
                traits = new[] { new[] { "Implacável", "Ao cair a 0 PV, fica com 1 PV (1x por descanso)." }, new[] { "Ataques selvagens", "Críticos corpo a corpo somam mais um dado de dano." } },
                namesF = new[] { "Urza", "Kragga", "Shura", "Yeva", "Ogra", "Vesh" }, namesM = new[] { "Grask", "Morn", "Dorgath", "Brakk", "Thokk", "Ruuk" }, lookHair = 0, lookStyle = "mohawk" },
            new RaceDef { key = "tiferino", name = "Tiferino", nameF = "Tiferina", desc = "Marcados por uma linhagem infernal: chifres, olhos de brasa e muita presença.", bonus = D(("CAR", 2), ("INT", 1)),
                skins = FIEND_SKINS, horns = true, blush = false, fireRes = true, traits = new[] { new[] { "Resistência infernal", "Metade do dano de fogo." }, new[] { "Chifres", "Presença marcante." } },
                namesF = new[] { "Lilith", "Nemeia", "Orianna", "Velka", "Ira", "Zara" }, namesM = new[] { "Damakos", "Mordai", "Akmen", "Skamos", "Kallas", "Orin" }, lookHair = 6, lookStyle = "long", lookEyes = 4 },
        }.ToDictionary(r => r.key);

        public static readonly (string v, string label)[] GENDERS = { ("f", "Feminino"), ("m", "Masculino"), ("n", "Não-binário") };
        /// <summary>Names to suggest for a race and gender.</summary>
        public static string[] NamesFor(string race, string g) => g == "f" ? RACES[race].namesF : g == "m" ? RACES[race].namesM : RACES[race].namesF.Concat(RACES[race].namesM).ToArray();
        /// <summary>A word in the right gender: Gword(g, "a ladina", "o ladino", "le ladine"); non-binary falls back to n or the masculine.</summary>
        public static string Gword(string gender, string f, string m, string n = null) => gender == "f" ? f : gender == "n" ? n ?? m : m;

        // ---------------------------------------------------------------- classes
        // profs: armour weight they can wear (0 roupa, 1 leve, 2 média, 3 pesada), martial weapons, shields.
        // options: the starting gear to choose from in the creator (the first of each is the default).
        public static readonly Dictionary<string, ClassDef> CLASSES = new List<ClassDef> {
            new ClassDef { key = "guerreiro", name = "Guerreiro", nameF = "Guerreira", desc = "Mestre das armas e da armadura. Aguenta a linha de frente e bate forte.", hitDie = 10, role = "martial",
                profArmor = 3, profMartial = true, profShield = true,
                optMain = new[] { "espadaLonga", "machadoBatalha", "marteloGuerra", "montante", "alabarda" }, optRanged = new[] { null, "arcoLongo", "bestaLeve" }, optArmor = new[] { "malha", "escamas", "couroBatido" }, optShield = new[] { false, true },
                abilities = new[] { "attack", "cleave", "secondwind", "potion" }, skills = new[] { "Atletismo", "Intimidação" },
                scores = D(("FOR", 15), ("DES", 13), ("CON", 14), ("INT", 8), ("SAB", 12), ("CAR", 10)), lookOutfit = 0, lookCape = 1 },
            new ClassDef { key = "barbaro", name = "Bárbaro", nameF = "Bárbara", desc = "Fúria das terras de fronteira. Sem armadura, a pele grossa e a raiva bastam.", hitDie = 12, role = "martial", unarmored = "CON",
                profArmor = 2, profMartial = true, profShield = true,
                optMain = new[] { "machadoGrande", "malho", "machadoBatalha", "montante", "alabarda" }, optRanged = new string[] { null }, optArmor = new[] { "roupas", "gibao" }, optShield = new[] { false, true },
                abilities = new[] { "attack", "rage", "potion" }, skills = new[] { "Atletismo", "Sobrevivência" },
                scores = D(("FOR", 15), ("DES", 13), ("CON", 15), ("INT", 8), ("SAB", 10), ("CAR", 8)), lookOutfit = 5, lookCape = 0 },
            new ClassDef { key = "paladino", name = "Paladino", nameF = "Paladina", desc = "Um juramento feito em voz alta. Golpes cheios de luz e mãos que curam.", hitDie = 10, role = "martial", caster = "CAR", slots = 2,
                profArmor = 3, profMartial = true, profShield = true,
                optMain = new[] { "espadaLonga", "marteloGuerra", "montante", "alabarda", "maca" }, optRanged = new string[] { null }, optArmor = new[] { "malha", "escamas" }, optShield = new[] { true, false },
                abilities = new[] { "attack", "smite", "layhands", "potion" }, skills = new[] { "Persuasão", "Intuição" },
                scores = D(("FOR", 15), ("DES", 8), ("CON", 14), ("INT", 8), ("SAB", 10), ("CAR", 15)), lookOutfit = 7, lookCape = 5 },
            new ClassDef { key = "patrulheiro", name = "Patrulheiro", nameF = "Patrulheira", desc = "Caçador das matas. Arco longo e a Marca do Caçador na presa.", hitDie = 10, role = "martial", caster = "SAB", slots = 2, showRanged = true,
                profArmor = 2, profMartial = true, profShield = true,
                optMain = new[] { "espadaCurta", "cimitarra", "machadinha", "lanca" }, optRanged = new[] { "arcoLongo", "arcoCurto", "bestaLeve" }, optArmor = new[] { "couroBatido", "escamas", "couro" }, optShield = new[] { false },
                abilities = new[] { "attack", "mark", "potion" }, skills = new[] { "Sobrevivência", "Percepção", "Furtividade", "Natureza" },
                scores = D(("FOR", 12), ("DES", 15), ("CON", 14), ("INT", 8), ("SAB", 14), ("CAR", 8)), lookOutfit = 1, lookCape = 1 },
            new ClassDef { key = "ladino", name = "Ladino", nameF = "Ladina", desc = "Ágil e traiçoeiro. Ataque furtivo quando um aliado distrai o alvo.", hitDie = 8, role = "martial", sneak = true,
                profArmor = 1, profFinesseMartial = true, profExtra = new[] { "espadaCurta", "cimitarra" },
                optMain = new[] { "espadaCurta", "adaga", "cimitarra" }, optRanged = new[] { "arcoCurto", "bestaLeve", null }, optArmor = new[] { "couro", "roupas" }, optShield = new[] { false },
                abilities = new[] { "attack", "cunning", "potion" }, skills = new[] { "Furtividade", "Prestidigitação", "Enganação", "Percepção" },
                scores = D(("FOR", 8), ("DES", 15), ("CON", 14), ("INT", 12), ("SAB", 10), ("CAR", 13)), lookOutfit = 4, lookCape = 4, lookStyle = "hood" },
            new ClassDef { key = "monge", name = "Monge", nameF = "Monja", desc = "Corpo treinado como arma. Sem armadura, rápido, e golpes que vêm em rajadas.", hitDie = 8, role = "martial", unarmored = "SAB", monk = true,
                profArmor = 0, profExtra = new[] { "espadaCurta" },
                optMain = new[] { "punhos", "cajado", "lanca", "espadaCurta" }, optRanged = new string[] { null }, optArmor = new[] { "roupas" }, optShield = new[] { false },
                abilities = new[] { "attack", "flurry", "potion" }, skills = new[] { "Acrobacia", "Intuição" },
                scores = D(("FOR", 10), ("DES", 15), ("CON", 13), ("INT", 8), ("SAB", 15), ("CAR", 8)), lookOutfit = 5, lookCape = 0, lookStyle = "bald" },
            new ClassDef { key = "bardo", name = "Bardo", nameF = "Barda", desc = "Histórias, canções e insultos que machucam de verdade. Inspira o grupo.", hitDie = 8, role = "caster", caster = "CAR", slots = 2,
                profArmor = 1, profFinesseMartial = true, profExtra = new[] { "espadaCurta", "cimitarra" },
                optMain = new[] { "espadaCurta", "cimitarra", "adaga" }, optRanged = new[] { null, "arcoCurto" }, optArmor = new[] { "couro", "roupas" }, optShield = new[] { false },
                abilities = new[] { "mockery", "healword", "inspire", "attack", "potion" }, skills = new[] { "Persuasão", "Enganação", "História", "Atuação" },
                scores = D(("FOR", 8), ("DES", 14), ("CON", 13), ("INT", 10), ("SAB", 10), ("CAR", 15)), lookOutfit = 2, lookCape = 2 },
            new ClassDef { key = "mago", name = "Mago", nameF = "Maga", desc = "Estudioso do arcano. Pouca vida, mas fogo e mísseis que nunca erram.", hitDie = 6, role = "caster", caster = "INT", slots = 2, mageArmor = 13,
                profArmor = 0,
                optMain = new[] { "cajado", "adaga" }, optRanged = new[] { null, "bestaLeve" }, optArmor = new[] { "robe", "roupas" }, optShield = new[] { false },
                abilities = new[] { "firebolt", "missiles", "attack", "potion" }, skills = new[] { "Arcanismo", "Investigação" },
                scores = D(("FOR", 8), ("DES", 14), ("CON", 14), ("INT", 15), ("SAB", 12), ("CAR", 8)), lookOutfit = 3, lookCape = 0 },
            new ClassDef { key = "bruxo", name = "Bruxo", nameF = "Bruxa", desc = "Um pacto com algo que não se explica. Rajadas místicas e uma maldição na presa.", hitDie = 8, role = "caster", caster = "CAR", slots = 1, markSpells = true,
                profArmor = 1,
                optMain = new[] { "adaga", "cajado", "maca" }, optRanged = new[] { null, "bestaLeve" }, optArmor = new[] { "couro", "roupas" }, optShield = new[] { false },
                abilities = new[] { "eldritch", "hex", "attack", "potion" }, skills = new[] { "Arcanismo", "Enganação" },
                scores = D(("FOR", 8), ("DES", 14), ("CON", 14), ("INT", 12), ("SAB", 10), ("CAR", 15)), lookOutfit = 4, lookCape = 4, lookStyle = "hood" },
            new ClassDef { key = "clerigo", name = "Clérigo", nameF = "Clériga", desc = "Servo de uma divindade. Cura os aliados e queima os inimigos com luz.", hitDie = 8, role = "caster", caster = "SAB", slots = 2,
                profArmor = 2, profShield = true, profExtra = new[] { "marteloGuerra" },
                optMain = new[] { "maca", "marteloGuerra", "lanca" }, optRanged = new[] { null, "bestaLeve" }, optArmor = new[] { "escamas", "couro" }, optShield = new[] { true, false },
                abilities = new[] { "attack", "sacredflame", "heal", "healword", "potion" }, skills = new[] { "Medicina", "Intuição" },
                scores = D(("FOR", 14), ("DES", 10), ("CON", 13), ("INT", 8), ("SAB", 15), ("CAR", 12)), lookOutfit = 7, lookCape = 5 },
            new ClassDef { key = "druida", name = "Druida", desc = "Fala com raízes e com bichos. Chamas na mão, cura e plantas que agarram.", hitDie = 8, role = "caster", caster = "SAB", slots = 2,
                profArmor = 2, profShield = true, profExtra = new[] { "cimitarra" },
                optMain = new[] { "cajadoCarvalho", "cajado", "lanca", "cimitarra" }, optRanged = new string[] { null }, optArmor = new[] { "couro", "gibao", "roupas" }, optShield = new[] { false, true },
                abilities = new[] { "produceflame", "entangle", "heal", "attack", "potion" }, skills = new[] { "Natureza", "Medicina" },
                scores = D(("FOR", 10), ("DES", 13), ("CON", 14), ("INT", 8), ("SAB", 15), ("CAR", 10)), lookOutfit = 1, lookCape = 1 },
        }.ToDictionary(c => c.key);

        /// <summary>Gendered display names.</summary>
        public static string ClassName(string cls, string g) => (g == "f" ? CLASSES[cls].nameF : null) ?? CLASSES[cls].name;
        public static string RaceName(string race, string g) => (g == "f" ? RACES[race].nameF : null) ?? RACES[race].name;

        // ---------------------------------------------------------------- a build
        /// <summary>A fresh build with the class's suggested scores, starting gear, and the race's typical look.</summary>
        public static Build NewBuild(string race = "humano", string cls = "guerreiro", string gender = "m")
        {
            var b = new Build { race = race, cls = cls, gender = gender, name = NamesFor(race, gender)[0], @base = new Dictionary<string, int>(CLASSES[cls].scores) };
            ApplyDefaultLook(b);
            DefaultGear(b);
            return b;
        }
        /// <summary>The class's default starting gear (the first option of each slot).</summary>
        public static void DefaultGear(Build b)
        {
            var c = CLASSES[b.cls];
            b.equip = new Equip { main = c.optMain[0], ranged = c.optRanged[0], armor = c.optArmor[0], shield = c.optShield[0] ? "escudo" : null };
        }
        /// <summary>Reset the parts of the look that depend on race/class (called when either changes).</summary>
        public static void ApplyDefaultLook(Build b, string what = "all")
        {
            var R = RACES[b.race]; var C = CLASSES[b.cls]; var L = b.look;
            if (what == "all" || what == "race")
            {
                L.skin = Math.Min(L.skin, R.skins.Length - 1);
                L.hair = R.lookHair; L.beard = b.gender == "f" ? null : R.lookBeard; L.eyes = R.lookEyes ?? 0;
                if (R.lookStyle != null) L.style = R.lookStyle; else if (L.style == null || L.style == "mohawk" || L.style == "long") L.style = b.gender == "f" ? "long" : "short";
            }
            if (what == "all" || what == "class")
            {
                L.outfit = C.lookOutfit; L.cape = C.lookCape;
                if (C.lookStyle != null) L.style = C.lookStyle; else if (L.style == "hood" || L.style == "bald") L.style = R.lookStyle ?? (b.gender == "f" ? "long" : "short");
            }
        }

        public static Dictionary<string, int> FinalScores(Build b)
        {
            var bonus = RACES[b.race].bonus; var o = new Dictionary<string, int>();
            foreach (var k in ABILS) o[k] = b.@base[k] + (bonus.TryGetValue(k, out var v) ? v : 0);
            return o;
        }

        /// <summary>Can this class use this weapon with proficiency?</summary>
        public static bool WeaponProficient(string cls, string key)
        {
            if (key == null || !Items.WEAPONS.TryGetValue(key, out var w)) return true;
            var P = CLASSES[cls];
            return w.cat == "simples" || P.profMartial || P.profExtra.Contains(key) || (P.profFinesseMartial && w.Has("fin"));
        }
        /// <summary>Can this class wear this armour (or carry a shield)?</summary>
        public static bool ArmorAllowed(string cls, string key) => Items.ARMOR_LEVEL[Items.ARMORS[key].cat] <= CLASSES[cls].profArmor;
        public static bool ShieldAllowed(string cls) => CLASSES[cls].profShield;

        /// <summary>Everything the game needs to know about a build and its gear, as numbers.</summary>
        public static Derived Derive(Build b, Equip eq = null)
        {
            eq ??= b.equip ?? new Equip();
            var R = RACES[b.race]; var C = CLASSES[b.cls]; var sc = FinalScores(b);
            int m(string k) => Mod(sc[k]);
            var notes = new List<string>();
            var fx = new GearFx();
            // armour class
            var A = Items.ARMORS[eq.armor ?? "roupas"]; var S = eq.shield != null ? Items.SHIELDS[eq.shield] : null;
            int ac = A.@base + Math.Min(m("DES"), A.dexMax); string acNote = A.name;
            if (A.cat == "roupa")
            {
                if (C.unarmored != null && !(C.monk && S != null)) { int alt = 10 + m("DES") + m(C.unarmored); if (alt > ac) { ac = alt; acNote = $"sem armadura (DES + {C.unarmored})"; } }
                if (C.mageArmor != 0) { int alt = C.mageArmor + m("DES"); if (alt > ac) { ac = alt; acNote = "Armadura Arcana"; } }
            }
            if (S != null) { ac += S.ac; acNote += " + escudo"; fx.Add(S.fx); }
            fx.Add(A.fx);
            int move = R.move ?? 6;
            if (A.str != 0 && sc["FOR"] < A.str) { move -= 1; notes.Add($"{A.name} pesa: −1 de movimento (FOR {sc["FOR"]} < {A.str})."); }
            if (C.monk && A.cat == "roupa" && S == null) move += 1;
            // the weapon in hand
            var W = Items.WEAPONS[eq.main ?? "punhos"];
            fx.Add(W.fx);
            bool prof = WeaponProficient(b.cls, eq.main ?? "punhos");
            if (!prof) notes.Add($"Sem proficiência com {W.name}: sem o bônus de +2 para acertar.");
            bool fin = W.Has("fin") || (C.monk && (W.cat == "simples" || W.type == "punhos" || eq.main == "espadaCurta"));
            string wStat = fin && m("DES") > m("FOR") ? "DES" : "FOR";
            int atk = (prof ? PROF : 0) + m(wStat) + W.bonus;
            if (W.Has("pesada") && R.small) { atk -= 2; notes.Add($"{W.name} é pesada demais para {R.name.ToLower()}s: −2 para acertar."); }
            string dice = W.dice;
            if (C.monk && W.type == "punhos") dice = "1d6";
            int dmgMod = m(wStat) + W.bonus + fx.dmgBonus;
            // the ranged weapon, if any
            var B = eq.ranged != null ? Items.WEAPONS[eq.ranged] : null;
            bool bprof = B != null && WeaponProficient(b.cls, eq.ranged);
            Bow bow = B != null ? new Bow { name = B.name, atk = (bprof ? PROF : 0) + m("DES") + B.bonus - (B.Has("pesada") && R.small ? 2 : 0), dmg = B.dice + U.FmtMod(m("DES")), range = B.range } : null;
            if (eq.shield != null && W.Has("duas")) { notes.Add($"{W.name} pede as duas mãos: o escudo fica nas costas."); ac -= S.ac; }
            int castMod = C.caster != null ? m(C.caster) : 0;
            var profSkills = new HashSet<string>(C.skills.Concat(R.skills).Concat(b.extraSkills ?? new List<string>()));
            var skills = new Dictionary<string, int>();
            foreach (var kv in SKILLS) skills[kv.Key] = m(kv.Value) + (profSkills.Contains(kv.Key) ? PROF : 0);
            if (A.stealth != 0) skills["Furtividade"] += A.stealth;
            return new Derived
            {
                scores = sc, maxHp = Math.Max(1, C.hitDie + m("CON") + R.hpPerLevel), hpPerLevel = Math.Max(1, (C.hitDie >> 1) + 1 + m("CON") + R.hpPerLevel),
                ac = ac, acNote = acNote, atk = atk, dmg = dice + U.FmtMod(dmgMod), weaponStat = wStat, weapon = W, reach = W.Has("alcance") ? 2 : 1,
                bow = bow, spellAtk = C.caster != null ? PROF + castMod + fx.spellAtk : (int?)null, castMod = castMod, maxSlots = C.slots,
                unarmed = "1d4" + U.FmtMod(Math.Max(m("DES"), m("FOR"))),
                move = move, init = m("DES") + R.init, skills = skills, proficient = profSkills, fx = fx, notes = notes,
            };
        }

        static readonly Col[] ORB_LEAF = U.Ramp("#2a5a1a", "#6ac040", "#d0ff90"), ORB_EMBER = U.Ramp("#6a1a10", "#ff7a2a", "#ffe0a0"), ORB_SKY = U.Ramp("#2a6a8a", "#5ad0ff", "#d0f8ff");
        static readonly Col[] TRIM_GOLD = U.Ramp("#6a4410", "#c48a1c", "#f4d050");

        /// <summary>The sprite spec for the character generator: the look, dressed in the gear.</summary>
        public static Spec SpecOf(Build b, Equip eq = null)
        {
            eq ??= b.equip ?? new Equip();
            var R = RACES[b.race]; var C = CLASSES[b.cls]; var L = b.look;
            var A = Items.ARMORS[eq.armor ?? "roupas"].look; var W = Items.WEAPONS[eq.main ?? "punhos"]; var B = eq.ranged != null ? Items.WEAPONS[eq.ranged] : null;
            var tunic = A.tunic ?? OUTFITS[L.outfit].ramp;
            bool robe = A.robe;
            var shown = (C.showRanged && B != null) || (W.type == "punhos" && B != null) ? B : W;
            return new Spec
            {
                skin = R.skins[L.skin], hair = HAIR_COLORS[L.hair].ramp, hairStyle = L.style, beard = L.beard, eyes = EYES[L.eyes].c,
                tunic = tunic, pants = robe ? U.Slice(tunic, 3) : PANTS, boots = BOOTS, cape = CAPES[L.cape].ramp,
                robe = robe, armor = A.armor, studs = A.studs, fur = A.fur, weapon = shown.sprite, wlen = shown.wlen,
                twoHand = shown == W && W.Has("duas"), // greatswords, greataxes, mauls, halberds: held with both hands
                orb = W.orb == "leaf" ? ORB_LEAF : W.orb == "ember" ? ORB_EMBER : ORB_SKY, trim = robe && A.trim ? TRIM_GOLD : null,
                shield = eq.shield != null && !W.Has("duas") ? (eq.shield == "escudoOrmun" ? "stone" : "wood") : null,
                ears = R.ears, small = R.small, stout = R.stout, horns = R.horns, tusks = R.tusks, blush = R.blush, femme = b.gender == "f",
            };
        }

        /// <summary>The unit definition the game spawns for this build.</summary>
        public static void HeroDef(Unit u, Build b, string key = "player")
        {
            var R = RACES[b.race]; var C = CLASSES[b.cls]; var d = Derive(b);
            u.key = key; u.build = b; u.equip = b.equip.Clone();
            u.name = string.IsNullOrWhiteSpace(b.name) ? NamesFor(b.race, b.gender)[0] : b.name.Trim();
            u.cls = ClassName(b.cls, b.gender) + " · " + RaceName(b.race, b.gender); u.team = "party";
            u.maxHp = d.maxHp; u.hpPerLevel = d.hpPerLevel; u.role = C.role; u.sneak = C.sneak; u.markSpells = C.markSpells; u.gender = b.gender;
            u.lucky = R.lucky; u.relentless = R.relentless; u.savage = R.savage; u.fireRes = R.fireRes;
            CombatStats(u, b, b.equip, d);
        }

        /// <summary>The parts of a unit that change with gear (recomputed whenever something is equipped).</summary>
        public static void CombatStats(Unit u, Build b, Equip eq, Derived d = null, int extra = 0)
        {
            d ??= Derive(b, eq);
            var C = CLASSES[b.cls];
            var abilities = C.abilities.Where(k => k != "shoot").ToList();
            if (d.bow != null) abilities.Insert(C.showRanged ? 0 : 1, "shoot");
            foreach (var k in b.extraAbilities ?? new List<string>()) if (!abilities.Contains(k)) abilities.Insert(Math.Max(0, abilities.IndexOf("potion")), k);
            u.ac = d.ac; u.atk = d.atk + extra; u.dmg = d.dmg; u.move = d.move; u.dex = d.init; u.reach = d.reach; u.unarmed = d.unarmed;
            u.bow = d.bow != null ? new Bow { name = d.bow.name, dmg = d.bow.dmg, range = d.bow.range, atk = d.bow.atk + extra } : null;
            u.maxSlots = d.maxSlots; u.spellAtk = d.spellAtk; u.castMod = d.castMod;
            u.abilities = abilities; u.skills = d.skills; u.wfx = d.fx; u.critMin = d.fx.critMin ?? 20; u.forgetWard = d.fx.forgetWard; u.fireRes = RACES[b.race].fireRes || d.fx.fireRes;
        }
    }
}
