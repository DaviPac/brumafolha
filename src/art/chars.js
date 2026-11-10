// Characters, built from parts at the pixel level: 4 facings, a 4-frame walk, an attack and a cast pose.
// Seen from high up and in front (3/4 top-down), big heads, lit from the top left, outlined dark.
import { PixBuf, ramp, rampAt, clamp, makeCanvas } from "../util.js";

export const SW = 26, SH = 36; // sprite cell; feet at (13, 34)
const INK = [22, 16, 28];
const METAL = ramp("#3a4250", "#6e7a90", "#aab6c8", "#eef4ff");
const GOLD = ramp("#6a4410", "#c48a1c", "#f4d050");
const WOOD = ramp("#3a2014", "#6a4026", "#9a6236");
const HORN = ramp("#2a1e22", "#5a4044", "#8a7068", "#c8b4a0");
const BOWWOOD = ramp("#4a2a14", "#7a4a22", "#b07a3a");

export const SPECS = {
  hero: {
    skin: ramp("#8a4e3a", "#c47e5e", "#eab08a", "#f8d0b0"), hair: ramp("#2a1610", "#4a2a1a", "#6e4026", "#90582e"), hairStyle: "short",
    tunic: ramp("#3e1e1a", "#6a2e22", "#94442a", "#b8623a"), pants: ramp("#1e1e2a", "#2e3040", "#43465a"), boots: ramp("#1a1010", "#3a2218", "#5a3622"),
    cape: ramp("#16301e", "#244a2a", "#36663a", "#4c8248"), weapon: "sword", ears: "human", eyes: [20, 14, 20],
  },
  mage: {
    skin: ramp("#9a6a5a", "#d8a088", "#f4cdb0", "#ffe6d0"), hair: ramp("#3e3a6a", "#6a68a0", "#a0a2d4", "#dcdef6"), hairStyle: "long",
    tunic: ramp("#1e1438", "#34205e", "#4e3288", "#6e4cb0"), pants: ramp("#1e1438", "#34205e", "#4e3288"), boots: ramp("#140c1e", "#24183a", "#38264e"),
    robe: true, weapon: "staff", orb: ramp("#2a6a8a", "#5ad0ff", "#d0f8ff"), ears: "elf", eyes: [40, 90, 120], trim: GOLD,
  },
  maren: {
    skin: ramp("#8a5a44", "#c48868", "#e8b490", "#f8d4b4"), hair: ramp("#5a5a60", "#8a8a90", "#b8b8bc", "#e0e0e2"), hairStyle: "bun",
    tunic: ramp("#18283e", "#22405e", "#2e5a80", "#4278a0"), pants: ramp("#18283e", "#22405e", "#2e5a80"), boots: ramp("#1a1010", "#3a2218", "#5a3622"),
    robe: true, apron: ramp("#8a7a5a", "#c8b890", "#ece0c0"), weapon: "none", ears: "human", eyes: [20, 14, 20],
  },
  goblin: {
    skin: ramp("#2a4a1a", "#4a7a26", "#6ea234", "#94c84a"), hair: null, hairStyle: "bald",
    tunic: ramp("#2a1c12", "#4a3420", "#6a4e30", "#8a6a42"), pants: ramp("#1e1610", "#33261a", "#4a3826"), boots: ramp("#140e0a", "#261a10", "#3a2818"),
    weapon: "dagger", ears: "goblin", eyes: [250, 210, 60], small: true,
  },
  shaman: {
    skin: ramp("#2a4a1a", "#4a7a26", "#6ea234", "#94c84a"), hair: ramp("#3a1418", "#5e2228", "#86343a", "#a84a4a"), hairStyle: "hood",
    tunic: ramp("#3a1418", "#5e2228", "#86343a", "#a84a4a"), pants: ramp("#1e1610", "#33261a", "#4a3826"), boots: ramp("#140e0a", "#261a10", "#3a2818"),
    robe: true, weapon: "staff", orb: ramp("#6a1a10", "#ff7a2a", "#ffe0a0"), ears: "goblin", eyes: [250, 120, 40], small: true, bones: true,
  },
  chief: {
    skin: ramp("#24401a", "#3e6a24", "#5a8e30", "#7cb040"), hair: ramp("#1a1010", "#2e1c14", "#4a2e1e", "#5e3c24"), hairStyle: "mohawk",
    tunic: ramp("#2a2a30", "#44464e", "#62666e", "#8a8e96"), pants: ramp("#1e1610", "#33261a", "#4a3826"), boots: ramp("#140e0a", "#261a10", "#3a2818"),
    weapon: "axe", ears: "goblin", eyes: [255, 60, 40], big: true, cape: ramp("#3a0e10", "#5e1a1a", "#862828", "#a83a32"),
  },
  // --- the prologue
  figure: { // the faceless crowd of dreamed Velmoor
    skin: ramp("#8a8e9a", "#a8acb8", "#c4c8d2", "#dcdfe6"), hair: ramp("#6a6e7c", "#868a98", "#a2a6b4", "#bec2ce"), hairStyle: "hood",
    tunic: ramp("#7a8090", "#9aa0ae", "#b8bdc8", "#d4d8e0"), pants: ramp("#7a8090", "#9aa0ae", "#b8bdc8"), boots: ramp("#5a5e6a", "#72768a", "#8a8ea0"),
    robe: true, weapon: "none", ears: "human", faceless: true, blush: false,
  },
  archivist: { // the silver woman of the dream, and her reflection in the Relicário
    skin: ramp("#9a8a90", "#d4c4c8", "#f0e4e6", "#fff6f6"), hair: ramp("#7a8094", "#aab2c4", "#d6dce8", "#f8faff"), hairStyle: "long",
    tunic: ramp("#4a4a6a", "#7a7aa0", "#aeb0d0", "#e0e2f4"), pants: ramp("#4a4a6a", "#7a7aa0", "#aeb0d0"), boots: ramp("#2a2a3a", "#4a4a5e", "#6a6a80"),
    robe: true, trim: ramp("#6a7088", "#b0b8d0", "#f0f4ff"), weapon: "none", ears: "human", eyes: [150, 190, 240],
  },
  statue: { // a Velmoor archivist carved in marble (makeStatue greys it out)
    skin: ramp("#606060", "#909090", "#b8b8b8", "#d8d8d8"), hair: ramp("#505050", "#808080", "#a8a8a8", "#c8c8c8"), hairStyle: "hood",
    tunic: ramp("#585858", "#888888", "#b0b0b0", "#d0d0d0"), pants: ramp("#585858", "#888888", "#b0b0b0"), boots: ramp("#404040", "#606060", "#808080"),
    robe: true, weapon: "staff", orb: ramp("#2a6a8a", "#5ad0ff", "#d0f8ff"), ears: "human", faceless: true, big: true,
  },
  esvaido: { // the Forgotten: grey, quiet, white-eyed
    skin: ramp("#6a6a6e", "#8e8e92", "#aeaeb0", "#c8c8ca"), hair: ramp("#3a3a40", "#56565c", "#727278", "#8e8e94"), hairStyle: "long",
    tunic: ramp("#3e3e48", "#585864", "#747482", "#9090a0"), pants: ramp("#2e2e36", "#444450", "#5a5a68"), boots: ramp("#1e1e24", "#2e2e36", "#3e3e48"),
    weapon: "none", ears: "human", eyes: [240, 244, 255], blush: false,
  },
  esvaidoFisher: { // Otávio, in his fisherman's clothes
    skin: ramp("#6e6a66", "#928e88", "#b2aea8", "#ccc8c2"), hair: ramp("#4a4a4e", "#6a6a6e", "#8a8a8e", "#a8a8ac"), hairStyle: "short", beard: "short",
    tunic: ramp("#1e2a36", "#2e3e4e", "#405466", "#566c80"), pants: ramp("#2a2620", "#3e382e", "#544c3e"), boots: ramp("#1a1010", "#2e2018", "#423024"),
    apron: ramp("#5a5444", "#7a7460", "#9a947e"), weapon: "none", ears: "human", eyes: [240, 244, 255], blush: false,
  },
  cendra: { // Sister Cendra of the Serene Veil
    skin: ramp("#8a5a4a", "#c08a74", "#e4b498", "#f6d6be"), hair: ramp("#c8ccd8", "#dde0e8", "#eef0f4", "#ffffff"), hairStyle: "hood",
    tunic: ramp("#8a8e9e", "#b4b8c6", "#d8dbe4", "#f4f5f8"), pants: ramp("#8a8e9e", "#b4b8c6", "#d8dbe4"), boots: ramp("#3a3a48", "#565666", "#727284"),
    robe: true, trim: ramp("#6a7088", "#b0b8d0", "#f0f4ff"), weapon: "staff", orb: ramp("#8a9ab8", "#d0e0ff", "#ffffff"), ears: "human", eyes: [120, 150, 190],
    cape: ramp("#b8bcc8", "#d4d7e0", "#eceef2", "#ffffff"),
  },
  silas: { // Brother Silas, the monk who doubted
    skin: ramp("#6a4430", "#9a6a4a", "#c49068", "#e0b48a"), hair: null, hairStyle: "bald",
    tunic: ramp("#7e8290", "#a6aab6", "#cacdd6", "#e6e8ee"), pants: ramp("#7e8290", "#a6aab6", "#cacdd6"), boots: ramp("#3a2a20", "#5a4030", "#7a5840"),
    robe: true, weapon: "none", ears: "human", eyes: [40, 30, 20], beard: "short",
  },
  murta: { // the shaman's granddaughter
    skin: ramp("#2e4e1e", "#4e8028", "#72a838", "#98cc50"), hair: ramp("#2a1410", "#4a2418", "#6e3a22", "#8e5030"), hairStyle: "long",
    tunic: ramp("#3a2a12", "#5e4420", "#866230", "#aa8444"), pants: ramp("#1e1610", "#33261a", "#4a3826"), boots: ramp("#140e0a", "#261a10", "#3a2818"),
    weapon: "bow", ears: "goblin", eyes: [250, 200, 60], small: true, cape: ramp("#2a3a1a", "#3e5426", "#566e32", "#6e8a40"),
  },
  fiapo: { // the patrol's skinny talker
    skin: ramp("#34501c", "#56822a", "#7aaa3a", "#a0d050"), hair: ramp("#2a1c12", "#4a3420", "#6a4e30", "#8a6a42"), hairStyle: "hood",
    tunic: ramp("#3a2418", "#5a3a26", "#7a5434", "#9a6e46"), pants: ramp("#1e1610", "#33261a", "#4a3826"), boots: ramp("#140e0a", "#261a10", "#3a2818"),
    weapon: "dagger", ears: "goblin", eyes: [250, 230, 90], small: true,
  },
  goblinElder: { // the clan's old ones, hiding in the shelter
    skin: ramp("#3a4a2a", "#5a6e40", "#7a9058", "#9ab070"), hair: ramp("#6a6a60", "#8a8a80", "#aaaaa0", "#c8c8c0"), hairStyle: "long",
    tunic: ramp("#3a3228", "#56483a", "#72624e", "#8e7e66"), pants: ramp("#2a241c", "#3e3428", "#544836"), boots: ramp("#140e0a", "#261a10", "#3a2818"),
    robe: true, weapon: "none", ears: "goblin", eyes: [230, 200, 120], small: true,
  },
  goblinKid: {
    skin: ramp("#3a5a1e", "#5e8e2c", "#82b43e", "#a8d858"), hair: null, hairStyle: "bald",
    tunic: ramp("#4a2a2a", "#6a3e3a", "#8a564e", "#aa7066"), pants: ramp("#1e1610", "#33261a", "#4a3826"), boots: ramp("#140e0a", "#261a10", "#3a2818"),
    weapon: "none", ears: "goblin", eyes: [250, 220, 80], small: true,
  },
};

function box(pb, x, y, w, h, R, o = {}) {
  const { round = 0, flipLight = false, base = 0.55 } = o;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (round && ((i < round && j < round && i + j < round) || (i >= w - round && j < round && (w - 1 - i) + j < round) ||
        (i < round && j >= h - round && i + (h - 1 - j) < round) || (i >= w - round && j >= h - round && (w - 1 - i) + (h - 1 - j) < round))) continue;
      let v = base;
      const li = flipLight ? w - 1 - i : i;
      if (li === 0) v += 0.22;
      if (li === w - 1) v -= 0.28;
      if (j === 0) v += 0.15;
      if (j === h - 1) v -= 0.22;
      pb.set(x + i, y + j, rampAt(R, clamp(v), x + i, y + j));
    }
}

function drawSprite(S, dir, frame, pose) {
  const pb = new PixBuf(SW, SH);
  const cx = 13;
  const sm = !!S.small, big = !!S.big, st = !!S.stout; // stout: short legs, broad body (dwarves)
  // layout
  const feet = 34;
  const lh = sm || st ? 5 : 7, th = sm ? 7 : big ? 11 : st ? 9 : 10, hh = sm ? 11 : 12, hw = sm ? 12 : 12;
  const phase = pose === "walk" ? [1, 0, -1, 0][frame] : 0;
  const bob = pose === "walk" && frame % 2 === 0 ? 1 : 0;
  const ly = feet - lh;
  const ty = ly - th + 1 + bob;
  const hy = ty - hh + 1;
  const tw = big || st ? 12 : sm ? 9 : 10;
  const side = dir === 1 || dir === 2;
  const back = dir === 3;

  const legs = () => {
    if (S.robe && !side) {
      // feet peeking under the robe
      const l = phase === 1 ? -1 : 0, r = phase === -1 ? -1 : 0;
      box(pb, cx - 4, feet - 2 + l, 3, 2, S.boots);
      box(pb, cx + 1, feet - 2 + r, 3, 2, S.boots);
      return;
    }
    if (side) {
      const sw = phase * 2;
      const leg = (dx, shade) => {
        const x = cx - 1 + dx;
        box(pb, x, ly + bob, 3, lh - 2 - bob, shade ? S.pants.map((c) => c.map((v) => v * 0.8)) : S.pants);
        box(pb, x + (dir === 2 ? 0 : -1), feet - 2, 4, 2, S.boots);
      };
      leg(-sw, true);
      leg(sw, false);
      return;
    }
    const lift = (p) => (phase === p ? 1 : 0);
    box(pb, cx - 4, ly + bob, 3, lh - 2 - bob - lift(1), S.pants);
    box(pb, cx - 4, feet - 2 - lift(1), 3, 2, S.boots);
    box(pb, cx + 1, ly + bob, 3, lh - 2 - bob - lift(-1), S.pants);
    box(pb, cx + 1, feet - 2 - lift(-1), 3, 2, S.boots);
  };

  const capeBack = () => {
    if (!S.cape) return;
    if (back) return; // drawn on top later
    if (side) {
      const x = dir === 2 ? cx - 5 : cx + 2;
      const flutter = pose === "walk" ? [0, 1, 0, 1][frame] : 0;
      box(pb, x, ty + 1, 3, th + 2 + flutter, S.cape, { flipLight: dir === 1 });
    } else {
      box(pb, cx - tw / 2 - 1, ty + 1, tw + 2, th + 1, S.cape);
    }
  };

  const torso = () => {
    const w = side ? 7 : tw, x = cx - Math.floor(w / 2) - (side ? 0 : 0);
    const h = S.robe ? feet - ty - (side ? 1 : 2) : th;
    box(pb, x, ty, w, h, S.tunic, { round: 1, flipLight: dir === 1 });
    if (S.robe) {
      // flare at the hem
      box(pb, x - 1, ty + h - 3, w + 2, 3, S.tunic, { flipLight: dir === 1 });
      if (S.trim) for (let i = 0; i < w + 2; i++) pb.set(x - 1 + i, ty + h - 1, S.trim[(i & 1) + 1]);
      if (S.apron && !back) box(pb, x + 1 + (side ? (dir === 2 ? 2 : -1) : 1), ty + 4, side ? 3 : w - 4, h - 6, S.apron);
    } else if (!back || true) {
      // belt
      for (let i = 0; i < w; i++) pb.set(x + i, ty + th - 3, [40, 24, 18]);
      if (!back) pb.set(x + (side ? (dir === 2 ? w - 2 : 1) : Math.floor(w / 2)), ty + th - 3, GOLD[2]);
    }
    if (!back && !side) { pb.set(cx - 1, ty, S.skin[1]); pb.set(cx, ty, S.skin[1]); }
    if (S.bones && !back) for (let i = 0; i < w; i += 2) pb.set(x + i, ty + 1, [230, 220, 196]);
    if (S.studs && !back) for (let j = 2; j < th - 4; j += 2) for (let i = 1 + (j & 2 ? 1 : 0); i < w - 1; i += 3) pb.set(x + i, ty + j, METAL[3]);
    if (S.fur) for (let i = -1; i <= w; i++) { pb.set(x + i, ty, [196, 176, 140]); if ((i + frame) % 2) pb.set(x + i, ty + 1, [150, 128, 96]); }
    if (S.armor && !S.robe) { // steel pauldrons and a breastplate edge
      const pads = side ? [dir === 2 ? x + 1 : x + w - 4] : [x - 1, x + w - 2];
      for (const px of pads) box(pb, px, ty, 3, 3, METAL, { round: 1, flipLight: dir === 1 });
      if (!back && !side) for (let j = 3; j < th - 3; j++) pb.set(cx - 1 + (j & 1), ty + j, METAL[2]);
    }
  };

  const arm = (x, y, len, shade, hand = true) => {
    const R = shade ? S.tunic.map((c) => c.map((v) => v * 0.75)) : S.tunic;
    box(pb, x, y, 2, len - 2, R);
    if (hand) box(pb, x, y + len - 2, 2, 2, S.skin);
  };

  const arms = () => {
    const swing = pose === "walk" ? phase : 0;
    const up = pose === "cast" ? -5 : 0;
    if (side) {
      const fwd = dir === 2 ? 1 : -1;
      if (pose === "attack") {
        // arm thrust forward
        for (let i = 0; i < 6; i++) { pb.set(cx + fwd * i, ty + 3, S.tunic[2]); pb.set(cx + fwd * i, ty + 4, S.tunic[1]); }
        box(pb, cx + fwd * 6 - (fwd < 0 ? 1 : 0), ty + 3, 2, 2, S.skin);
        return;
      }
      arm(cx - 1 - swing * fwd * 2, ty + 1 + up, 7, false);
      return;
    }
    const lx = cx - Math.floor(tw / 2) - 2, rx = cx + Math.ceil(tw / 2);
    if (pose === "attack" && !back) {
      arm(lx, ty + 1, 7, false);
      // weapon arm reaches forward/down
      box(pb, rx - 1, ty + 4, 2, 6, S.tunic);
      box(pb, rx - 1, ty + 10, 2, 2, S.skin);
      return;
    }
    arm(lx, ty + 1 + swing + up, 7, false);
    arm(rx, ty + 1 - swing + up, 7, true);
  };

  // ---------------------------------------------------------------- two-handed weapons
  // Big weapons are carried, not dangled (the convention of open 3/4 sprite sets like the LPC ones): the weapon sits
  // diagonally in front of the body, pointing where the character faces, with both hands on the grip and spaced
  // apart along it, drawn over the handle. Polearms are longer and hold their hands further apart.
  const twoHanded = (stage) => {
    const W = S.weapon, pole = W === "spear", sword = W === "sword", great = (S.wlen ?? 0) >= 2;
    const grip = sword ? 5 : pole ? 9 : 7; // handle length before the blade/head
    let len = sword ? 10 + (S.wlen ?? 0) : pole ? 13 + (S.wlen ?? 0) : 5 + (S.wlen ?? 0); // blade or haft beyond the hands
    let total = grip + len + (sword ? 1 : 0);
    const f = dir === 1 ? -1 : 1, attack = pose === "attack", base = feet - 1;
    const lx = cx - Math.floor(tw / 2) - 1, rx = cx + Math.ceil(tw / 2) - 1;
    // where the pommel is and which way the weapon runs (one pixel per step on the long axis)
    let P, D, hands = sword ? [1, 3] : pole ? [2, 7] : [2, 5];
    if (pole) {
      // polearms stand upright beside the body, clear of the torso and the face; they only tilt to strike
      if (side) { if (attack) { P = [cx - 6 * f, ty + 3]; D = [0.85 * f, 0.5]; } else { P = [cx + 6 * f, base]; D = [0, -1]; } }
      else if (back) { if (attack) { P = [lx - 2, ty + 3]; D = [-0.1, -1]; } else { P = [lx - 2, base]; D = [0, -1]; } }
      else if (attack) { P = [rx + 2, ty]; D = [0.12, 1]; } // driven down beside the leg
      else { P = [rx + 3, base]; D = [0, -1]; }
      if (!attack) hands = [base - (ty + 8), base - (ty + 2)]; // hip and shoulder height
    } else if (sword && !attack) {
      // the low guard of a right-handed swordsman: both hands together at the left hip, the point down and out
      // to the left. Seen from the front that's the right of the screen; from behind, the left. The point aims at the
      // ground in front, so the blade is foreshortened (it wouldn't fit the cell at full length anyway).
      if (side) { P = [cx + f, ty + 5]; D = [0.7 * f, 0.8]; len = 9; } // hands at the front of the waist, point forward and down
      else if (back) { P = [cx - 2, ty + 5]; D = [-0.6, 0.8]; len = 8; }
      else { P = [cx + 2, ty + 5]; D = [0.6, 0.8]; len = 8; }
      total = grip + len + 1;
    } else if (side) {
      if (attack) { P = [cx - 4 * f, ty + 3]; D = [f, 0.45]; } // swung through, blade forward and down
      else { P = [cx - 2 * f, ty + 10]; D = [0.55 * f, -1]; } // held up in front of the face
    } else if (back) {
      if (attack) { P = [cx + 1, ty + 4]; D = [-0.5, -1]; } // raised overhead, away from us
      else { P = [cx - 6, ty + 11]; D = [1, -0.62]; } // across the chest: only the end shows past a shoulder
    } else {
      if (attack) { P = [cx - 3, ty + 3]; D = [0.45, 1]; } // brought down in front
      // across the chest, pommel at the hip: anything steeper would vanish behind the big head
      else { P = [cx + 6, ty + 11]; D = [-1, -0.62]; }
    }
    const at = (t) => [Math.round(P[0] + D[0] * t), Math.round(P[1] + D[1] * t)];
    // slide the weapon back along itself until its business end fits in the cell (a clipped tip reads as nothing)
    for (let k = 0; k < 14; k++) {
      const [x, y] = at(total - 1);
      if (x >= 1 && x <= SW - 2 && y >= 1 && y <= SH - 2) break;
      P = [P[0] - D[0], P[1] - D[1]];
    }
    const steep = Math.abs(D[1]) >= Math.abs(D[0]);
    /** A run of pixels across the weapon at a point: up to three, light to dark from the top-left. */
    const across = (x, y, cs) => cs.forEach((c, i) => c && (steep ? pb.set(x + i - (cs.length > 2 ? 1 : 0), y, c) : pb.set(x, y + i - (cs.length > 2 ? 1 : 0), c)));
    const drawWeapon = () => {
      for (let t = -1; t < total; t++) {
        const [x, y] = at(t);
        if (sword) {
          if (t === -1) across(x, y, [GOLD[2], GOLD[0]]);
          else if (t < grip) across(x, y, [[86, 50, 30], [52, 30, 20]]);
          else if (t === grip) { // the crossguard, across the blade
            const nx = Math.round(-D[1] * 1.6), ny = Math.round(D[0] * 1.6);
            for (const k of [-1, 0, 1]) pb.set(x + nx * k, y + ny * k, GOLD[k === 0 ? 2 : 1]);
            pb.set(x + nx * 2, y + ny * 2, GOLD[0]); pb.set(x - nx * 2, y - ny * 2, GOLD[0]);
          } else {
            const fromTip = total - 1 - t;
            // a greatsword's blade is three pixels wide (edge, fuller, edge) and narrows at the point
            if (great && fromTip > 1) across(x, y, [METAL[3], METAL[2], METAL[1]]);
            else across(x, y, fromTip === 0 ? [METAL[3]] : [METAL[3], METAL[1]]);
          }
        } else {
          const tip = pole && t >= total - 3;
          across(x, y, tip ? (t === total - 1 ? [METAL[3]] : [METAL[3], METAL[1]]) : [WOOD[1 + (t & 1)], WOOD[0]]);
        }
      }
      const [ex, ey] = at(total - 1);
      const nx = Math.sign(Math.round(-D[1])) || 0, ny = Math.sign(Math.round(D[0])) || 0;
      if (W === "axe") { // a broad head on one side of the haft
        for (let k = 1; k <= 4; k++) for (let j = -2; j <= 1; j++) {
          const [hx, hy2] = at(total - 2 + j);
          pb.set(hx + nx * k, hy2 + ny * k, METAL[k === 4 ? 3 : k === 1 ? 1 : 2]);
        }
      }
      if (W === "hammer" || W === "mace") box(pb, ex - 2, ey - 2, 5, 4, METAL);
      if (pole && (S.wlen ?? 0) > 0) { // the halberd's axe blade, below the point, on the outer side
        const out = side ? f : back ? -1 : 1, up = D[1] < 0;
        for (let j = 0; j < 4; j++) for (let k = 1; k <= 3; k++) {
          const [hx, hy2] = at(total - 4 - j);
          if (steep) pb.set(hx + out * k, hy2, METAL[k === 3 ? 3 : j === 0 && up ? 3 : 2]);
          else pb.set(hx, hy2 + k, METAL[k === 3 ? 1 : 2]);
        }
      }
    };
    const hand = (t) => { const [x, y] = at(t); box(pb, x - 1, y - 1, 2, 2, S.skin); };
    /** A sleeve from the shoulder to a point on the grip, two pixels thick. */
    const sleeve = (sx, sy, t, shade) => {
      const [x, y] = at(t), R = shade ? S.tunic.map((c) => c.map((v) => v * 0.75)) : S.tunic;
      const n = Math.max(1, Math.abs(x - sx), Math.abs(y - sy));
      for (let i = 0; i <= n; i++) {
        const px = Math.round(sx + ((x - sx) * i) / n), py = Math.round(sy + ((y - sy) * i) / n);
        pb.set(px, py, R[2]); pb.set(px + 1, py, R[1]); pb.set(px, py + 1, R[1]);
      }
    };
    // a polearm thrust from the side runs past the far side of the body: the body hides the middle of the shaft
    const sideThrust = side && pole && attack;
    // facing right, the left hip is the far side: the low guard sits behind the body, and only the near hand shows
    const farGuard = side && sword && !attack && dir === 2;
    if (stage === "behind") {
      if ((back && !pole) || sideThrust || farGuard) drawWeapon();
      if (farGuard) hand(hands[0]);
      return;
    }
    if (back) { // the arms reach forward, out of sight: just the shoulders and upper arms
      if (pole) drawWeapon();
      box(pb, lx - 1, ty + 1, 2, 4, S.tunic); box(pb, rx + 1, ty + 1, 2, 4, S.tunic);
      return;
    }
    if (side) {
      if (!sideThrust && !farGuard) drawWeapon();
      if (!farGuard) hand(hands[0]); // the far hand, lower on the grip
      sleeve(cx - f, ty + 2, hands[1], false);
      hand(hands[1]);
      return;
    }
    // the arms go under the weapon: they hold it, it doesn't pass through them
    sleeve(rx, ty + 1, pole && !attack ? hands[1] : hands[0], true);
    sleeve(lx, ty + 1, pole && !attack ? hands[0] : hands[1], false);
    drawWeapon();
    hand(hands[0]); hand(hands[1]);
  };


  const head = () => {
    const w = side ? 11 : hw;
    const x = cx - Math.floor(w / 2);
    box(pb, x, hy, w, hh, S.skin, { round: 3, base: 0.6, flipLight: dir === 1 });
    // ears
    const earY = hy + Math.floor(hh * 0.55);
    if (S.ears === "elf" || S.ears === "goblin") {
      const L = S.ears === "goblin" ? 4 : 2;
      const sides = side ? [dir === 2 ? -1 : 1] : [-1, 1];
      for (const s of sides) {
        const ex = s < 0 ? x - 1 : x + w;
        for (let i = 0; i < L; i++) { pb.set(ex + s * i, earY - i, S.skin[i === L - 1 ? 3 : 2]); pb.set(ex + s * i, earY - i + 1, S.skin[1]); }
      }
    }
    if (back || S.faceless) return;
    // face
    const ey = hy + Math.floor(hh * 0.58);
    const eye = (ex) => {
      if (S.ears === "goblin") { pb.set(ex, ey, S.eyes); pb.set(ex, ey + 1, [20, 10, 10]); }
      else { pb.set(ex, ey, S.eyes); pb.set(ex, ey + 1, S.eyes); }
    };
    if (side) {
      const f = dir === 2 ? 1 : -1;
      eye(cx + f * 3);
      if (S.femme) pb.set(cx + f * 4, ey - 1, INK);
      pb.set(cx + f * 6, ey + 1, S.skin[2]); // nose
      pb.set(cx + f * 3, ey + 3, S.skin[0]);
      if (S.tusks) { pb.set(cx + f * 4, ey + 2, [240, 240, 220]); pb.set(cx + f * 4, ey + 3, [240, 240, 220]); }
    } else {
      eye(cx - 3); eye(cx + 2);
      if (S.femme) { pb.set(cx - 4, ey - 1, INK); pb.set(cx + 3, ey - 1, INK); pb.set(cx - 1, ey + 3, [200, 110, 110]); }
      if (S.blush !== false) { pb.set(cx - 4, ey + 2, [230, 120, 110]); pb.set(cx + 3, ey + 2, [230, 120, 110]); }
      pb.set(cx - 1, ey + 3, S.skin[0]); pb.set(cx, ey + 3, S.skin[0]);
      if (S.ears === "goblin" || S.tusks) { pb.set(cx - 2, ey + 3, [240, 240, 220]); pb.set(cx + 1, ey + 3, [240, 240, 220]); } // fangs / tusks
      if (S.tusks) { pb.set(cx - 3, ey + 2, [240, 240, 220]); pb.set(cx + 2, ey + 2, [240, 240, 220]); }
    }
  };

  const hair = () => {
    const H = S.hair;
    if (!H || S.hairStyle === "bald") return;
    const w = side ? 11 : hw;
    const x = cx - Math.floor(w / 2);
    const px = (i, j, v) => pb.set(x + i, hy + j, rampAt(H, clamp(v), x + i, hy + j));
    const shadeAt = (i, j) => 0.62 + (dir === 1 ? i - w / 2 : w / 2 - i) * 0.035 - j * 0.03;
    if (S.hairStyle === "mohawk") {
      for (let j = -3; j < hh - 4; j++) for (let i = Math.floor(w / 2) - 1; i <= Math.floor(w / 2) + 1; i++) if (j < 3 || back) px(i, j, shadeAt(i, j) + 0.1);
      return;
    }
    const hood = S.hairStyle === "hood";
    const long = S.hairStyle === "long" || hood;
    for (let j = -1; j < hh + (long ? 6 : 0); j++)
      for (let i = -1; i <= w; i++) {
        let on = false;
        if (back) on = j < hh - (long ? -5 : 2) && i >= (j < 1 ? 1 : 0) - (j > 2 && hood ? 1 : 0) && i < w - (j < 1 ? 1 : 0) + (j > 2 && hood ? 1 : 0);
        else if (side) {
          const f = dir === 2;
          const backSide = f ? i < 5 : i > w - 6;
          on = (j < 4 && i >= 0 && i < w) || (j === 4 && (f ? i < 9 : i > 1)) || (backSide && j < (long ? hh + 5 : hh - 2) && i >= -1 && i <= w);
          if (hood) on = on || (j < hh && (f ? i < 3 : i > w - 4));
        } else {
          on = j < 4 && i >= 0 && i < w;
          if (j === -1) on = i >= 2 && i < w - 2;
          if (j === 4) on = i < 3 || i > w - 4 || i === 5 || (i === 6 && !hood);
          if (j > 4) on = (i <= (hood ? 1 : 0) || i >= w - (hood ? 2 : 1)) && j < (long ? hh + 5 : hh - 3);
          if (hood && j > 4) on = (i <= 1 || i >= w - 2) && j < hh + 1;
        }
        if (on) px(i, j, shadeAt(i, j));
      }
    if (S.hairStyle === "bun") for (let j = -4; j < 0; j++) for (let i = 4; i < 8; i++) if (!(j === -4 && (i === 4 || i === 7))) px(i, j, 0.7 - j * 0.02);
    // a highlight streak
    if (!hood) for (let i = 2; i < w - 4; i += 2) pb.set(x + i, hy + 1, H[H.length - 1]);
  };

  const beard = () => {
    const H = S.hair;
    if (!H || !S.beard || back) return;
    const ey = hy + Math.floor(hh * 0.58), long = S.beard === "long";
    const chin = hy + hh - 1 + (long ? 5 : 1);
    const px = (x, y, v) => pb.set(x, y, rampAt(H, clamp(v), x, y));
    if (side) {
      const f = dir === 2 ? 1 : -1;
      for (let y = ey + 2; y <= chin; y++) for (let i = 0; i < 6; i++) if (y > ey + 2 || i > 1) px(cx + f * (i - (y > hy + hh ? 1 : 0)), y, 0.55 - (y - ey) * 0.02 + i * 0.02);
      return;
    }
    for (let y = ey + 2; y <= chin; y++) {
      const half = y <= hy + hh - 1 ? 5 : Math.max(1, 5 - (y - hy - hh) * (long ? 0.8 : 2));
      for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
        if (y === ey + 2 && x >= cx - 2 && x < cx + 2) continue; // mouth
        px(x, y, 0.62 - (x - cx) * 0.03 - (y - ey) * 0.015);
      }
    }
  };

  const horns = () => {
    if (!S.horns) return;
    const w = side ? 11 : hw, x = cx - Math.floor(w / 2);
    const one = (bx, s) => { // grows up and curls outward
      const pts = [[0, 0], [0, -1], [s, -2], [s, -3], [s * 2, -3]];
      pts.forEach(([dx, dy], i) => pb.set(bx + dx, hy + dy, HORN[Math.min(3, 1 + (i >> 1))]));
      pb.set(bx + s, hy - 1, HORN[0]);
    };
    if (side) { const f = dir === 2 ? 1 : -1; one(cx - f * 1, -f); return; }
    one(x + 2, -1); one(x + w - 3, 1);
  };

  const capeFront = () => {
    if (!S.cape || !back) return;
    const flutter = pose === "walk" ? [0, 1, 0, 1][frame] : 0;
    box(pb, cx - Math.floor(tw / 2) - 1, ty, tw + 2, th + 3 + flutter, S.cape, { round: 1 });
    for (let j = 3; j < th + 2; j += 1) { pb.set(cx - 2, ty + j, S.cape[1]); pb.set(cx + 2, ty + j, S.cape[1]); }
  };

  // blades and hafts: a line of pixels; maces swap the steel for a wooden haft and a knob on the end
  // hammers and spears have wooden hafts too; a spear ends in an iron point
  const wooden = (W) => W === "mace" || W === "hammer" || W === "spear";
  const shaft = (i, len, W) => (W === "spear" && i >= len - 3 ? METAL[3] : wooden(W) ? WOOD[1 + (i & 1)] : METAL[2]);
  const shaftDark = (W) => (wooden(W) ? WOOD[0] : METAL[1]);
  const knob = (x, y) => box(pb, x - 1, y - 1, 3, 3, METAL, { round: 1 });
  const whead = (W, x, y) => { if (W === "mace") knob(x, y); if (W === "hammer") box(pb, x - 2, y - 1, 5, 3, METAL); };
  const bladeLen = (W, attack) => {
    const base = W === "dagger" ? (attack ? 5 : 4) : W === "mace" || W === "hammer" ? (attack ? 7 : 6) : W === "spear" ? (attack ? 14 : 12) : attack ? 11 : W === "axe" ? 9 : 10;
    return Math.max(3, base + (W === "dagger" ? 0 : S.wlen ?? 0));
  };
  const tip = (x, y) => { pb.set(x, y - 2, METAL[3]); pb.set(x, y - 1, METAL[3]); pb.set(x, y, METAL[2]); pb.set(x - 1, y, METAL[1]); pb.set(x + 1, y, METAL[1]); };
  /** A round shield on the off arm: wood with an iron rim and boss, or Ormun's grey stone. */
  const shield = () => {
    if (!S.shield) return;
    const R = S.shield === "stone" ? ramp("#3a3e44", "#5e646c", "#868c94", "#acb2b8") : ramp("#3a1e10", "#5e3418", "#844c24", "#a86a34");
    if (side) {
      const f = dir === 2 ? 1 : -1;
      box(pb, cx + (f > 0 ? -6 : 3), ty + 1, 3, 8, R, { round: 1, flipLight: dir === 1 });
      return;
    }
    const x = back ? cx + Math.ceil(tw / 2) - 3 : cx - Math.floor(tw / 2) - 4;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 7; i++) {
      const q = ((i - 3) / 3.5) ** 2 + ((j - 3.5) / 4) ** 2;
      if (q > 1) continue;
      pb.set(x + i, ty + 1 + j, q > 0.7 ? METAL[q > 0.85 ? 0 : 1] : rampAt(R, clamp(0.75 - (i + j) * 0.05), x + i, ty + j));
    }
    if (!back) { pb.set(x + 3, ty + 4, METAL[3]); pb.set(x + 3, ty + 5, METAL[2]); }
  };

  /** A short bow seen edge-on: an arc of wood and a straight string; `pull` draws the string back. */
  const bow = (x, y0, len, s, pull = 0) => {
    for (let k = 0; k <= len; k++) {
      const bulge = Math.round(2.4 * Math.sin((Math.PI * k) / len));
      pb.set(x + s * bulge, y0 + k, BOWWOOD[k === 0 || k === len ? 0 : k % 3 === 0 ? 1 : 2]);
    }
    const mid = y0 + (len >> 1);
    for (let k = 1; k < len; k++) {
      const d = Math.abs(y0 + k - mid) / (len / 2), off = Math.round(pull * (1 - d));
      pb.set(x - s * off, y0 + k, [222, 214, 196]);
    }
  };

  const weapon = (behind) => {
    const W = S.weapon;
    if (W === "none") return;
    const isStaff = W === "staff", pole = W === "spear";
    if (back) {
      if (!behind) return;
      if (isStaff || pole) { for (let j = hy - 4; j < feet - 1; j++) pb.set(cx + 6, j, WOOD[j % 3 === 0 ? 1 : 2]); pole ? tip(cx + 6, hy - 5) : orb(cx + 6, hy - 5); return; }
      if (W === "bow") { // slung across the back
        for (let i = 0; i < 12; i++) pb.set(cx - 6 + i, ty + 9 - i, BOWWOOD[i % 3 === 0 ? 1 : 2]);
        for (let i = 1; i < 11; i++) pb.set(cx - 4 + i, ty + 10 - i, [200, 192, 176]);
        return;
      }
      const len = W === "dagger" ? 5 : 11;
      for (let i = 0; i < len; i++) { pb.set(cx - 5 + i, ty + 8 - i, shaft(i, len, W)); pb.set(cx - 4 + i, ty + 8 - i, shaftDark(W)); }
      whead(W, cx - 5 + len, ty + 8 - len);
      pb.set(cx - 6, ty + 9, WOOD[1]); pb.set(cx - 7, ty + 10, WOOD[1]);
      return;
    }
    if (behind) return;
    if (side) {
      const f = dir === 2 ? 1 : -1;
      if (isStaff || (pole && pose !== "attack")) {
        const hx = cx + (pose === "cast" ? f * 2 : 0);
        const top = hy - (pose === "cast" ? 8 : 4);
        for (let j = top; j < feet - 1; j++) pb.set(hx + f * 1, j, WOOD[j % 3 === 0 ? 1 : 2]);
        pole ? tip(hx + f, top - 1) : orb(hx + f, top - 1);
        return;
      }
      if (W === "bow") {
        const aim = pose === "attack" || pose === "cast";
        bow(cx + f * (aim ? 7 : 4), ty - (aim ? 3 : 1), aim ? 13 : 12, f, aim ? 4 : 0);
        return;
      }
      if (pose === "attack") {
        const len = bladeLen(W, true);
        for (let i = 0; i < len; i++) { pb.set(cx + f * (8 + i), ty + 3, wooden(W) ? shaft(i, len, W) : METAL[3]); pb.set(cx + f * (8 + i), ty + 4, shaftDark(W)); }
        pb.set(cx + f * 7, ty + 2, GOLD[1]); pb.set(cx + f * 7, ty + 5, GOLD[1]);
        if (W === "axe") box(pb, cx + f * (8 + len - 4) - (f < 0 ? 3 : 0), ty, 4, 7, METAL);
        whead(W, cx + f * (8 + len), ty + 3);
        return;
      }
      const hx = cx - 1, hy2 = ty + 7;
      const len = bladeLen(W, false);
      for (let i = 0; i < len; i++) pb.set(Math.round(hx + f * (1 + i * 0.6)), Math.round(hy2 + 1 + i * 0.8), shaft(i, len, W));
      pb.set(hx, hy2, GOLD[1]); pb.set(hx + f, hy2, GOLD[1]);
      if (W === "axe") box(pb, hx + f * 5 - 1, hy2 + 5, 4, 4, METAL);
      whead(W, Math.round(hx + f * (1 + len * 0.6)), Math.round(hy2 + 1 + len * 0.8));
      return;
    }
    // facing us
    const hx = cx + Math.ceil(tw / 2);
    if (isStaff || (pole && pose !== "attack")) {
      const top = hy - (pose === "cast" ? 8 : 3);
      for (let j = top; j < feet; j++) pb.set(hx + 2, j, WOOD[j % 3 === 0 ? 1 : 2]);
      pole ? tip(hx + 2, top - 1) : orb(hx + 2, top - 1);
      return;
    }
    if (W === "bow") {
      const aim = pose === "attack" || pose === "cast";
      bow(hx + 1, ty - (aim ? 4 : 1), 13, 1, aim ? 3 : 0);
      return;
    }
    if (pose === "attack") {
      const len = bladeLen(W, true);
      for (let i = 0; i < len; i++) { pb.set(hx, ty + 12 + i, wooden(W) ? shaft(i, len, W) : METAL[3]); pb.set(hx + 1, ty + 12 + i, shaftDark(W)); }
      pb.set(hx - 1, ty + 12, GOLD[1]); pb.set(hx + 2, ty + 12, GOLD[1]);
      if (W === "axe") box(pb, hx + 1, ty + 12 + len - 4, 4, 4, METAL);
      whead(W, hx + 1, ty + 12 + len);
      return;
    }
    const top = ty + 6;
    const len = bladeLen(W, false);
    pb.set(hx - 1 + 1, top, GOLD[1]); pb.set(hx + 2, top + 1, GOLD[1]); pb.set(hx - 1, top + 1, GOLD[1]);
    for (let i = 0; i < len; i++) { pb.set(hx + 1, top + 2 + i, shaft(i, len, W)); pb.set(hx + 2, top + 2 + i, shaftDark(W)); }
    if (W === "axe") box(pb, hx + 2, top + len - 3, 4, 4, METAL);
    whead(W, hx + 2, top + 2 + len);
  };

  const orb = (x, y) => {
    const O = S.orb;
    pb.set(x, y - 1, O[2]); pb.set(x - 1, y, O[1]); pb.set(x, y, O[2]); pb.set(x + 1, y, O[1]); pb.set(x, y + 1, O[0]);
    if (pose === "cast") { pb.set(x, y - 2, O[2]); pb.set(x - 2, y, O[1]); pb.set(x + 2, y, O[1]); }
  };

  // ---------------------------------------------------------------- weapons put away (out of combat)
  // One-handed blades, axes and maces hang at the left hip, for a right hand to draw across the body; anything big
  // (two-handers, polearms, bows) goes diagonally across the back. Staffs stay in hand: they're walking sticks too.
  const sheathMode = !S.sheathed || S.weapon === "none" || S.weapon === "staff" ? null
    : S.twoHand || S.weapon === "spear" || S.weapon === "bow" ? "back" : "hip";
  const LEATHER = [[34, 20, 16], [64, 40, 26], [94, 60, 38]];
  /** A put-away weapon along a line from its low end (x0, y0) to its high end, where the hilt or the head is. */
  const carried = (x0, y0, x1, y1, keep = null) => {
    const W = S.weapon, n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    const pt = (i) => [Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)];
    const steep = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
    // `keep` lets a weapon be drawn in two passes, part in front of the body and part behind it
    const put = (x, y, c) => { if (!keep || keep(y)) pb.set(x, y, c); };
    // a diagonal two pixels wide reads thinner than a straight one: fill the step corner to keep its weight
    const diag = Math.abs(x1 - x0) > 0.4 * Math.abs(y1 - y0) && Math.abs(y1 - y0) > 0.4 * Math.abs(x1 - x0);
    const dot = (x, y, c, c2) => { put(x, y, c); if (c2) { steep ? put(x + 1, y, c2) : put(x, y + 1, c2); if (diag) put(x + 1, y + 1, c2); } };
    const blade = W === "sword" || W === "dagger";
    const wide = blade && S.twoHand; // a greatsword's scabbard is three pixels across, its hilt longer
    const dot3 = (x, y, a, b, c) => {
      if (!wide) return dot(x, y, a, c);
      steep ? (put(x - 1, y, a), put(x, y, b), put(x + 1, y, c)) : (put(x, y - 1, a), put(x, y, b), put(x, y + 1, c));
      if (diag) put(x + 1, y + 1, c);
    };
    const gripLen = wide ? 4 : 3;
    for (let i = 0; i <= n; i++) {
      const [x, y] = pt(i), fromTop = n - i;
      if (blade) {
        if (fromTop === 0) dot3(x, y, GOLD[2], GOLD[1], GOLD[0]); // pommel
        else if (fromTop < gripLen) dot(x, y, [86, 50, 30], [52, 30, 20]); // grip
        else if (fromTop === gripLen) { // the crossguard, across the scabbard's mouth
          const ux = (x1 - x0) / n, uy = (y1 - y0) / n, gx = -uy, gy = ux;
          for (let k = -(wide ? 3 : 2); k <= (wide ? 3 : 2); k++) put(Math.round(x + gx * k), Math.round(y + gy * k), GOLD[k === 0 ? 2 : Math.abs(k) > 2 ? 0 : 1]);
        } else if (i === 0) dot3(x, y, METAL[3], METAL[2], METAL[1]); // the chape at the end of the scabbard
        else dot3(x, y, LEATHER[2], LEATHER[1], LEATHER[0]);
      } else if (W === "bow") put(x, y, BOWWOOD[i === 0 || i === n ? 0 : 1 + (i % 2)]);
      else if (W === "spear" && fromTop < 3) dot(x, y, METAL[3], METAL[1]);
      else dot(x, y, WOOD[1 + (i & 1)], WOOD[0]);
    }
    const [hx, hy2] = pt(n);
    if (W === "bow") for (let i = 1; i < n; i++) { const [x, y] = pt(i), k = Math.sin((Math.PI * i) / n) * 2; put(Math.round(x + (steep ? k : 0)), Math.round(y + (steep ? 0 : k)), [210, 202, 186]); }
    if (keep && !keep(hy2)) return;
    if (W === "axe") box(pb, hx - (x1 > x0 ? 0 : 3), hy2 - 1, 4, 4, METAL);
    if (W === "mace") knob(hx, hy2);
    if (W === "hammer") box(pb, hx - 2, hy2 - 1, 5, 3, METAL);
  };
  const sheath = (stage) => {
    const L = (S.wlen ?? 0), f = dir === 1 ? -1 : 1, belt = ty + th - 3;
    const lxh = cx - Math.floor(tw / 2) - 1, rxh = cx + Math.ceil(tw / 2);
    if (sheathMode === "back") {
      // across the back, low end at one hip, high end over the other shoulder
      // The high end rises beside the head, never behind it: the line is aimed through a point just outside the head
      // and hair at chin height, then runs down across the back to the other hip.
      const reach = S.weapon === "spear" ? 10 : S.weapon === "bow" ? 2 : S.twoHand ? 5 : 3;
      const sgn = back ? 1 : side ? -f : -1; // which side of the screen the high end is on
      const topX = cx + sgn * Math.min(11, 9 + Math.round(reach * 0.25)), topY = ty - 6 - reach;
      const ax = cx + sgn * 8, ay = ty - 3; // clear of the head (and of long hair) by a pixel
      const lowY = ty + th + 1, lowX = Math.round(topX + ((ax - topX) * (lowY - topY)) / (ay - topY));
      if (back) {
        // seen from behind it lies across the back, over the cape: from the left hip, diagonally up to the right
        // shoulder, out beside the neck. Long weapons get their extra length downward (the butt near the feet),
        // since there's no room above in the cell.
        if (stage !== "front") return;
        const L = Math.min(feet - (ty - 6), S.weapon === "spear" ? 26 : S.weapon === "bow" ? 15 : S.twoHand ? 20 : 16);
        const tx2 = cx + 11, ty2 = ty - 6;
        carried(Math.round(tx2 - 0.9 * L), ty2 + L, tx2, ty2);
        return;
      }
      if (side) {
        // Seen from the side, the weapon lies along the back: over the cape, just outside the torso, so it covers
        // neither the body's side nor hides behind it. It rises past the nape, clear of the head and hair.
        if (stage !== "front") return;
        const long = S.weapon === "spear";
        carried(cx - f * 5, ty + th + 1, cx - f * (long ? 10 : 8), ty - (long ? 14 : 8));
        return;
      }
      if (stage === "behind") carried(lowX, lowY, topX, topY);
      return;
    }
    // at the left hip: the screen's right when facing us, the left from behind; the far side when facing right
    const len = S.weapon === "dagger" ? 5 : S.weapon === "sword" ? 10 + L : 7 + L;
    const near = !side || dir === 1;
    if ((stage === "front") !== near) return;
    if (back) carried(lxh - 3, belt + len - 2, lxh - 1, belt - 2);
    else if (side) carried(cx - 6 * f, belt + len - 4, cx + f, belt - 2);
    else carried(rxh + 3, belt + len - 2, rxh + 1, belt - 2); // just outside the hanging arm
  };

  const two = !!S.twoHand && S.weapon !== "none" && !sheathMode;
  if (sheathMode) sheath("behind"); else if (two) twoHanded("behind"); else weapon(true);
  capeBack();
  if (side && !two) { // the far arm, behind the body
    const fwd = dir === 2 ? 1 : -1, swing = pose === "walk" ? phase : 0;
    arm(cx - 1 + swing * fwd * 2, ty + 1, 6, true, true);
  }
  legs();
  torso();
  capeFront();
  if (back) shield();
  if (two && !side) twoHanded("front"); else if (!two) arms();
  if (sheathMode) sheath("front");
  head();
  hair();
  if (!back) shield(); // over long hair: it's strapped to the arm, in front
  beard();
  horns();
  if (two && side) twoHanded("front"); // held up in front of the face
  else if (!two && !sheathMode) weapon(false);
  pb.outline(INK);
  return pb;
}

/** dirs: 0 down, 1 left, 2 right, 3 up. frames: walk0..3, idle, attack, cast. */
export function buildCharacter(spec) {
  const ch = buildSheet(spec);
  // the same character with the weapon put away, for walking around out of combat
  if (spec.weapon && spec.weapon !== "none" && spec.weapon !== "staff") ch.sheathed = buildSheet({ ...spec, sheathed: true });
  return ch;
}

function buildSheet(spec) {
  const sheet = [];
  for (let dir = 0; dir < 4; dir++) {
    const row = [];
    for (let f = 0; f < 4; f++) row.push(drawSprite(spec, dir, f, "walk"));
    row.push(drawSprite(spec, dir, 0, "idle"));
    row.push(drawSprite(spec, dir, 0, "attack"));
    row.push(drawSprite(spec, dir, 0, "cast"));
    sheet.push(row);
  }
  const canvases = sheet.map((r) => r.map((pb) => pb.canvas()));
  // white silhouettes for the hit flash
  const flash = sheet.map((r) => r.map((pb) => {
    const w = new PixBuf(pb.w, pb.h);
    for (let y = 0; y < pb.h; y++) for (let x = 0; x < pb.w; x++) if (pb.alpha(x, y)) w.set(x, y, [255, 255, 255]);
    return w.canvas();
  }));
  return { frames: canvases, flash, bufs: sheet };
}

/** Portrait: the head and shoulders of the idle front frame, scaled up. */
export function portrait(ch, scale = 4) {
  const src = ch.frames[0][4];
  const [c, ctx] = makeCanvas(SW * scale, 24 * scale);
  ctx.drawImage(src, 0, 0, SW, 24, 0, 0, SW * scale, 24 * scale);
  return c;
}
