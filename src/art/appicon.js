// The game's leaf, pixel by pixel: it falls on the title screen (src/title.js) and is the app's icon (sw.js draws the
// icons the manifest asks for). No DOM here, so the service worker can use it with an OffscreenCanvas.

export const OUT = "#18121e";
export const GREEN = ["#1f4a2c", "#2f6b34", "#4f8f3c", "#86b84a"];
export const SILVER = ["#5a6a84", "#8ea2bc", "#c4d4e6", "#f2f6fb"];
export const LEAF = [ // 0 empty, 1 outline, 2–5 shade (dark → light), 6 vein
  "..............11",
  "...........11131",
  ".........1155531",
  "........15554531",
  ".......155545531",
  "......1554565431",
  ".....15545664431",
  "....155456444431",
  "...15556444431..",
  "...1546444431...",
  "..1546444331....",
  "..1564443331....",
  ".1564433331.....",
  ".16433331.......",
  "16111111........",
  "1...............",
];

/** Paint the leaf at (ox, oy), each of its pixels a k×k square; `solid` paints its silhouette in one colour. */
export function paintLeaf(ctx, ramp, ox = 0, oy = 0, k = 1, solid = null) {
  LEAF.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    ctx.fillStyle = solid ?? (ch === "1" ? OUT : ch === "6" ? ramp[0] : ramp[+ch - 2]);
    ctx.fillRect(ox + i * k, oy + j * k, k, k);
  }));
}

/**
 * The app icon, size × size: the leaf over the night valley's dark, with a low ring of mist behind it, all in big
 * square pixels, the same size for the leaf and the mist: a 24×24 grid (the leaf is 16 of it), or 32×32 for a maskable
 * icon, which keeps the leaf inside the circle every launcher's mask leaves visible.
 */
export function drawAppIcon(ctx, size, maskable = false) {
  const g = maskable ? 32 : 24, px = Math.max(1, Math.floor(size / g)), o = Math.floor((size - px * g) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b0a10";
  ctx.fillRect(0, 0, size, size);
  // the mist: rings of dithered teal, densest in the middle
  const u = g / 32, ring = [["#123a3c", 15 * u], ["#16484a", 11.5 * u], ["#1c5a58", 8 * u]];
  for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
    const d = Math.hypot(x + 0.5 - g / 2, y + 0.5 - g / 2 - 1);
    for (let r = ring.length - 1; r >= 0; r--) {
      const [c, rad] = ring[r];
      if (d < rad - 1 || (d < rad + 0.6 && (x + y) % 2 === 0)) { ctx.fillStyle = c; ctx.fillRect(o + x * px, o + y * px, px, px); break; }
    }
  }
  // a few motes of light in the mist
  ctx.fillStyle = "#5fd0c8";
  const motes = maskable ? [[10, 11], [22, 9], [23, 21], [9, 22]] : [[3, 5], [19, 3], [20, 16], [3, 17]];
  for (const [x, y] of motes) ctx.fillRect(o + x * px, o + y * px, px, px);
  // the leaf in the middle of the grid
  const k = px, ox = o + ((g - 16) / 2) * px;
  ctx.globalAlpha = 0.45; // its shadow, then the leaf
  paintLeaf(ctx, GREEN, ox + k, ox + k, k, "#000");
  ctx.globalAlpha = 1;
  paintLeaf(ctx, GREEN, ox, ox, k);
}
