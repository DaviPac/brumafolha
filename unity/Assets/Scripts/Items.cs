// Equipment: weapons by type, armour and clothes by weight, shields. Each piece has numbers (dice, armour class),
// a look (the sprite changes when you wear it) and sometimes an effect. Ported from src/items.js.
using System.Collections.Generic;
using System.Linq;

namespace Brumafolha
{
    /// <summary>What a piece of gear does beyond its numbers. Numbers add up across pieces; flags just turn on.</summary>
    public class GearFx
    {
        public string vsForgotten;
        public int? critMin;
        public int dmgBonus, healBonus, fireBonus, spellAtk;
        public bool forgetWard, fireRes;
        public bool Any => vsForgotten != null || critMin != null || dmgBonus != 0 || healBonus != 0 || fireBonus != 0 || spellAtk != 0 || forgetWard || fireRes;
        public void Add(GearFx o)
        {
            if (o == null) return;
            if (o.vsForgotten != null) vsForgotten = o.vsForgotten;
            if (o.critMin != null) critMin = (critMin ?? 0) + o.critMin;
            dmgBonus += o.dmgBonus; healBonus += o.healBonus; fireBonus += o.fireBonus; spellAtk += o.spellAtk;
            forgetWard |= o.forgetWard; fireRes |= o.fireRes;
        }
    }

    public class WeaponDef
    {
        public string key, name, type, dice, cat, sprite = "none", orb, desc;
        public string[] props = new string[0];
        public int wlen, bonus, range;
        public bool rare;
        public GearFx fx;
        public bool Has(string p) => props.Contains(p);
    }

    public class ArmorLook { public Col[] tunic; public bool robe, armor, studs, fur; public bool trim = true; }
    public class ArmorDef
    {
        public string key, name, cat, desc;
        public int @base, dexMax, stealth, str;
        public bool rare;
        public ArmorLook look = new ArmorLook();
        public GearFx fx;
    }
    public class ShieldDef { public string key, name, desc; public int ac; public bool rare; public GearFx fx; }

    /// <summary>A bag entry: a piece of equipment (gear != null) or a story item (letters you can read).</summary>
    public class Item
    {
        public string id, gear, key, name, icon, desc, read;
        public Item Clone() => (Item)MemberwiseClone();
    }

    public static class Items
    {
        public static readonly Dictionary<string, string> WEAPON_TYPES = new Dictionary<string, string> {
            ["punhos"] = "Punhos", ["adaga"] = "Adagas", ["espada"] = "Espadas", ["machado"] = "Machados", ["maca"] = "Maças e martelos",
            ["lanca"] = "Lanças e hastes", ["cajado"] = "Cajados", ["arco"] = "Arcos e bestas",
        };

        static WeaponDef Wp(string key, string name, string type, string dice, string cat, string[] props, string sprite, string desc, int wlen = 0, int bonus = 0, bool rare = false, GearFx fx = null, int range = 0, string orb = null)
            => new WeaponDef { key = key, name = name, type = type, dice = dice, cat = cat, props = props, sprite = sprite, desc = desc, wlen = wlen, bonus = bonus, rare = rare, fx = fx, range = range, orb = orb };
        static readonly string[] NONE = new string[0];

        // cat: simples | marcial. props: fin (acuidade: FOR ou DES), pesada, duas (duas mãos), alcance (ataca a 2 casas)
        public static readonly Dictionary<string, WeaponDef> WEAPONS = new List<WeaponDef> {
            Wp("punhos", "Punhos", "punhos", "1d4", "simples", new[] { "fin" }, "none", "Mãos nuas. Monges batem com acuidade."),
            Wp("adaga", "Adaga", "adaga", "1d4", "simples", new[] { "fin" }, "dagger", "Leve e rápida."),
            Wp("adagaVelmoor", "Adaga de Velmoor", "adaga", "1d4", "simples", new[] { "fin" }, "dagger", "Prata branca que nunca embaça. +1 para acertar e no dano; +1d4 contra Esvaídos.", bonus: 1, rare: true, fx: new GearFx { vsForgotten = "1d4" }),
            Wp("espadaCurta", "Espada curta", "espada", "1d6", "marcial", new[] { "fin" }, "sword", "Lâmina curta de soldado.", wlen: -2),
            Wp("cimitarra", "Cimitarra", "espada", "1d6", "marcial", new[] { "fin" }, "sword", "Curva, feita para cortar em movimento.", wlen: -1),
            Wp("espadaLonga", "Espada longa", "espada", "1d8", "marcial", NONE, "sword", "A arma de quem aprendeu num quartel."),
            Wp("montante", "Montante", "espada", "2d6", "marcial", new[] { "pesada", "duas" }, "sword", "Uma espada do tamanho de uma pessoa pequena.", wlen: 3),
            Wp("machadinha", "Machadinha", "machado", "1d6", "simples", NONE, "axe", "Serve para lenha e para goblins.", wlen: -3),
            Wp("machadoBatalha", "Machado de batalha", "machado", "1d8", "marcial", NONE, "axe", "Lâmina larga, cabo de freixo."),
            Wp("machadoGrande", "Machado grande", "machado", "1d12", "marcial", new[] { "pesada", "duas" }, "axe", "Pesado demais para ser elegante.", wlen: 3),
            Wp("machadoGorza", "Machado de Gorza", "machado", "1d12", "marcial", new[] { "pesada", "duas" }, "axe", "Lascado, remendado com corda, e muito pesado. Crítico em 19 ou 20.", wlen: 3, rare: true, fx: new GearFx { critMin = 19 }),
            Wp("maca", "Maça", "maca", "1d6", "simples", NONE, "mace", "Uma bola de ferro num cabo."),
            Wp("marteloGuerra", "Martelo de guerra", "maca", "1d8", "marcial", NONE, "hammer", "Achata elmos."),
            Wp("malho", "Malho", "maca", "2d6", "marcial", new[] { "pesada", "duas" }, "hammer", "Um martelo de ferreiro que decidiu ir à guerra.", wlen: 3),
            Wp("lanca", "Lança", "lanca", "1d6", "simples", NONE, "spear", "Haste de freixo, ponta de ferro."),
            Wp("lancaGoblin", "Lança goblin", "lanca", "1d6", "simples", NONE, "spear", "Ponta de osso afiada até brilhar. +1 de dano.", fx: new GearFx { dmgBonus = 1 }),
            Wp("alabarda", "Alabarda", "lanca", "1d10", "marcial", new[] { "pesada", "duas", "alcance" }, "spear", "Ataca inimigos a 2 casas de distância.", wlen: 3),
            Wp("cajado", "Cajado", "cajado", "1d6", "simples", NONE, "staff", "Madeira firme, para andar e para bater."),
            Wp("cajadoCarvalho", "Cajado de carvalho", "cajado", "1d6", "simples", NONE, "staff", "Ainda brota folhas na ponta. +2 nas curas.", orb: "leaf", fx: new GearFx { healBonus = 2 }),
            Wp("cajadoOsso", "Cajado de osso da Avó", "cajado", "1d6", "simples", NONE, "staff", "Ossos, contas e fuligem. Magias de fogo causam +2 de dano.", orb: "ember", rare: true, fx: new GearFx { fireBonus = 2 }),
            Wp("arcoCurto", "Arco curto", "arco", "1d6", "simples", new[] { "dist" }, "bow", "Alcance 8.", range: 8),
            Wp("arcoLongo", "Arco longo", "arco", "1d8", "marcial", new[] { "dist", "duas" }, "bow", "Alcance 10.", range: 10),
            Wp("bestaLeve", "Besta leve", "arco", "1d8", "simples", new[] { "dist" }, "bow", "Alcance 9. Fácil de usar, lenta de armar.", range: 9),
        }.ToDictionary(w => w.key);

        static readonly Col[] steel = U.Ramp("#3a4250", "#5e6878", "#8a96a8", "#b8c4d4");
        // cat: roupa | leve | media | pesada. Lighter pieces let more Destreza through (dexMax).
        public static readonly Dictionary<string, ArmorDef> ARMORS = new List<ArmorDef> {
            new ArmorDef { key = "roupas", name = "Roupas de viagem", cat = "roupa", @base = 10, dexMax = 9, desc = "Sem armadura. Classes que lutam sem armadura usam a própria defesa." },
            new ArmorDef { key = "robe", name = "Robe de estudioso", cat = "roupa", @base = 10, dexMax = 9, look = new ArmorLook { robe = true, trim = true }, fx = new GearFx { spellAtk = 1 }, desc = "Bordado com runas de foco. +1 para acertar magias." },
            new ArmorDef { key = "mantoBruma", name = "Manto de Bruma", cat = "roupa", @base = 11, dexMax = 9, rare = true, look = new ArmorLook { robe = true, tunic = U.Ramp("#7e8496", "#a8aec0", "#cdd2de", "#eef0f6") },
                fx = new GearFx { forgetWard = true }, desc = "Tecido de Velmoor, frio ao toque. CA 11 + DES. Imune à condição Esquecido." },
            new ArmorDef { key = "couro", name = "Armadura de couro", cat = "leve", @base = 11, dexMax = 9, look = new ArmorLook { tunic = U.Ramp("#2e1a10", "#4e2e1a", "#6e4426", "#8e5c34") }, desc = "CA 11 + DES." },
            new ArmorDef { key = "couroBatido", name = "Couro batido", cat = "leve", @base = 12, dexMax = 9, look = new ArmorLook { tunic = U.Ramp("#26180e", "#44281a", "#62402a", "#806040"), studs = true }, desc = "CA 12 + DES." },
            new ArmorDef { key = "gibao", name = "Gibão de peles", cat = "media", @base = 12, dexMax = 2, look = new ArmorLook { tunic = U.Ramp("#3a2a1a", "#5e4630", "#86684a", "#ae9068"), fur = true }, desc = "CA 12 + DES (máx. 2). Quente, e cheira a bicho." },
            new ArmorDef { key = "escamas", name = "Cota de escamas", cat = "media", @base = 14, dexMax = 2, stealth = -3, look = new ArmorLook { tunic = steel, armor = true }, desc = "CA 14 + DES (máx. 2). Barulhenta: −3 em Furtividade." },
            new ArmorDef { key = "malha", name = "Cota de malha", cat = "pesada", @base = 16, dexMax = 0, stealth = -3, str = 13, look = new ArmorLook { tunic = steel, armor = true }, desc = "CA 16. Exige FOR 13 (senão −1 de movimento). −3 em Furtividade." },
        }.ToDictionary(a => a.key);

        public static readonly Dictionary<string, ShieldDef> SHIELDS = new Dictionary<string, ShieldDef> {
            ["escudo"] = new ShieldDef { key = "escudo", name = "Escudo de madeira", ac = 2, desc = "+2 de CA. Ocupa a outra mão." },
            ["escudoOrmun"] = new ShieldDef { key = "escudoOrmun", name = "Escudo de Ormun", ac = 2, rare = true, fx = new GearFx { fireRes = true }, desc = "Pedra gravada com runas anãs. +2 de CA e metade do dano de fogo." },
        };

        public static readonly Dictionary<string, int> ARMOR_LEVEL = new Dictionary<string, int> { ["roupa"] = 0, ["leve"] = 1, ["media"] = 2, ["pesada"] = 3 };
        public static readonly Dictionary<string, string> ARMOR_CAT_NAMES = new Dictionary<string, string> { ["roupa"] = "roupa", ["leve"] = "leve", ["media"] = "média", ["pesada"] = "pesada" };

        public static string NameOf(string kind, string key) => kind == "weapon" || kind == "ranged" || kind == "main" ? WEAPONS[key].name : kind == "armor" ? ARMORS[key].name : SHIELDS[key].name;
        public static string DescOf(string kind, string key) => kind == "weapon" || kind == "ranged" || kind == "main" ? WEAPONS[key].desc : kind == "armor" ? ARMORS[key].desc : SHIELDS[key].desc;

        /// <summary>A bag entry for a piece of equipment.</summary>
        public static Item GearItem(string kind, string key)
        {
            string icon;
            if (kind == "armor") icon = "armor";
            else if (kind == "shield") icon = "shield";
            else
            {
                var t = WEAPONS[key].type;
                icon = t == "arco" ? "bow" : t == "cajado" ? "staff" : t == "machado" ? "axe" : t == "maca" ? "hammer" : t == "adaga" ? "dagger" : t == "lanca" ? "spear" : "sword";
            }
            string id = kind + ":" + key + ":" + ((int)(U.Rand() * 1e7)).ToString("x");
            return new Item { id = id, gear = kind == "ranged" ? "weapon" : kind, key = key, name = NameOf(kind, key), icon = icon, desc = DescOf(kind, key) };
        }

        /// <summary>One line describing a weapon's numbers.</summary>
        public static string WeaponLine(WeaponDef w)
        {
            var p = new List<string>();
            if (w.Has("fin")) p.Add("acuidade");
            if (w.Has("pesada")) p.Add("pesada");
            if (w.Has("duas")) p.Add("duas mãos");
            if (w.Has("alcance")) p.Add("alcance 2");
            if (w.range != 0) p.Add("distância " + w.range);
            return w.dice + (w.bonus != 0 ? " +" + w.bonus : "") + " · " + w.cat + (p.Count > 0 ? " · " + string.Join(", ", p) : "");
        }
    }
}
