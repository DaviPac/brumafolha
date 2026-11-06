// Characters, built from parts at the pixel level: 4 facings, a 4-frame walk, an attack and a cast pose.
// Seen from high up and in front (3/4 top-down), big heads, lit from the top left, outlined dark.
import { PixBuf, ramp, rampAt, clamp, makeCanvas } from "../util.js";

export const SW = 26, SH = 36; // sprite cell; feet at (13, 34)
const INK = [22, 16, 28];
const METAL = ramp("#3a4250", "#6e7a90", "#aab6c8", "#eef4ff");
const GOLD = ramp("#6a4410", "#c48a1c", "#f4d050");
const WOOD = ramp("#3a2014", "#6a4026", "#9a6236");

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
  const sm = !!S.small, big = !!S.big;
  // layout
  const feet = 34;
  const lh = sm ? 5 : 7, th = sm ? 7 : big ? 11 : 10, hh = sm ? 11 : 12, hw = sm ? 12 : 12;
  const phase = pose === "walk" ? [1, 0, -1, 0][frame] : 0;
  const bob = pose === "walk" && frame % 2 === 0 ? 1 : 0;
  const ly = feet - lh;
  const ty = ly - th + 1 + bob;
  const hy = ty - hh + 1;
  const tw = big ? 12 : sm ? 9 : 10;
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
    if (back) return;
    // face
    const ey = hy + Math.floor(hh * 0.58);
    const eye = (ex) => {
      if (S.small) { pb.set(ex, ey, S.eyes); pb.set(ex, ey + 1, [20, 10, 10]); }
      else { pb.set(ex, ey, S.eyes); pb.set(ex, ey + 1, S.eyes); }
    };
    if (side) {
      const f = dir === 2 ? 1 : -1;
      eye(cx + f * 3);
      pb.set(cx + f * 6, ey + 1, S.skin[2]); // nose
      pb.set(cx + f * 3, ey + 3, S.skin[0]);
    } else {
      eye(cx - 3); eye(cx + 2);
      pb.set(cx - 4, ey + 2, [230, 120, 110]); pb.set(cx + 3, ey + 2, [230, 120, 110]);
      pb.set(cx - 1, ey + 3, S.skin[0]); pb.set(cx, ey + 3, S.skin[0]);
      if (S.small) { pb.set(cx - 2, ey + 3, [240, 240, 220]); pb.set(cx + 1, ey + 3, [240, 240, 220]); } // little fangs
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

  const capeFront = () => {
    if (!S.cape || !back) return;
    const flutter = pose === "walk" ? [0, 1, 0, 1][frame] : 0;
    box(pb, cx - Math.floor(tw / 2) - 1, ty, tw + 2, th + 3 + flutter, S.cape, { round: 1 });
    for (let j = 3; j < th + 2; j += 1) { pb.set(cx - 2, ty + j, S.cape[1]); pb.set(cx + 2, ty + j, S.cape[1]); }
  };

  const weapon = (behind) => {
    const W = S.weapon;
    if (W === "none") return;
    const isStaff = W === "staff";
    if (back) {
      if (!behind) return;
      if (isStaff) { for (let j = hy - 4; j < feet - 1; j++) pb.set(cx + 6, j, WOOD[j % 3 === 0 ? 1 : 2]); orb(cx + 6, hy - 5); return; }
      // across the back
      const len = W === "dagger" ? 5 : 11;
      for (let i = 0; i < len; i++) { pb.set(cx - 5 + i, ty + 8 - i, METAL[2]); pb.set(cx - 4 + i, ty + 8 - i, METAL[1]); }
      pb.set(cx - 6, ty + 9, WOOD[1]); pb.set(cx - 7, ty + 10, WOOD[1]);
      return;
    }
    if (behind) return;
    if (side) {
      const f = dir === 2 ? 1 : -1;
      if (isStaff) {
        const hx = cx + (pose === "cast" ? f * 2 : 0);
        const top = hy - (pose === "cast" ? 8 : 4);
        for (let j = top; j < feet - 1; j++) pb.set(hx + f * 1, j, WOOD[j % 3 === 0 ? 1 : 2]);
        orb(hx + f, top - 1);
        return;
      }
      if (pose === "attack") {
        const len = W === "dagger" ? 5 : 11;
        for (let i = 0; i < len; i++) { pb.set(cx + f * (8 + i), ty + 3, METAL[3]); pb.set(cx + f * (8 + i), ty + 4, METAL[1]); }
        pb.set(cx + f * 7, ty + 2, GOLD[1]); pb.set(cx + f * 7, ty + 5, GOLD[1]);
        if (W === "axe") box(pb, cx + f * (8 + len - 4) - (f < 0 ? 3 : 0), ty, 4, 7, METAL);
        return;
      }
      const hx = cx - 1, hy2 = ty + 7;
      const len = W === "dagger" ? 4 : 9;
      for (let i = 0; i < len; i++) { pb.set(hx + f * (1 + i * 0.6), hy2 + 1 + i * 0.8, METAL[2]); }
      pb.set(hx, hy2, GOLD[1]); pb.set(hx + f, hy2, GOLD[1]);
      if (W === "axe") box(pb, hx + f * 5 - 1, hy2 + 5, 4, 4, METAL);
      return;
    }
    // facing us
    const hx = cx + Math.ceil(tw / 2);
    if (isStaff) {
      const top = hy - (pose === "cast" ? 8 : 3);
      for (let j = top; j < feet; j++) pb.set(hx + 2, j, WOOD[j % 3 === 0 ? 1 : 2]);
      orb(hx + 2, top - 1);
      return;
    }
    if (pose === "attack") {
      const len = W === "dagger" ? 5 : 11;
      for (let i = 0; i < len; i++) { pb.set(hx, ty + 12 + i, METAL[3]); pb.set(hx + 1, ty + 12 + i, METAL[1]); }
      pb.set(hx - 1, ty + 12, GOLD[1]); pb.set(hx + 2, ty + 12, GOLD[1]);
      if (W === "axe") box(pb, hx + 1, ty + 12 + len - 4, 4, 4, METAL);
      return;
    }
    const top = ty + 6;
    const len = W === "dagger" ? 4 : 10;
    pb.set(hx - 1 + 1, top, GOLD[1]); pb.set(hx + 2, top + 1, GOLD[1]); pb.set(hx - 1, top + 1, GOLD[1]);
    for (let i = 0; i < len; i++) { pb.set(hx + 1, top + 2 + i, METAL[2]); pb.set(hx + 2, top + 2 + i, METAL[1]); }
    if (W === "axe") box(pb, hx + 2, top + len - 3, 4, 4, METAL);
  };

  const orb = (x, y) => {
    const O = S.orb;
    pb.set(x, y - 1, O[2]); pb.set(x - 1, y, O[1]); pb.set(x, y, O[2]); pb.set(x + 1, y, O[1]); pb.set(x, y + 1, O[0]);
    if (pose === "cast") { pb.set(x, y - 2, O[2]); pb.set(x - 2, y, O[1]); pb.set(x + 2, y, O[1]); }
  };

  weapon(true);
  capeBack();
  if (side) { // the far arm, behind the body
    const fwd = dir === 2 ? 1 : -1, swing = pose === "walk" ? phase : 0;
    arm(cx - 1 + swing * fwd * 2, ty + 1, 6, true, true);
  }
  legs();
  torso();
  capeFront();
  arms();
  head();
  hair();
  weapon(false);
  pb.outline(INK);
  return pb;
}

/** dirs: 0 down, 1 left, 2 right, 3 up. frames: walk0..3, idle, attack, cast. */
export function buildCharacter(spec) {
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
