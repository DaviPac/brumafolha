// The loading screen: a d20 rolling, a line saying what is being made, and a bar. It is a plain script (not a module),
// run while the page is still being read, so it is on screen from the very first frame, before the game's code has
// even arrived. The die is a real icosahedron turned in 3D and drawn pixel by pixel, in the silver of the game's d20,
// into a strip of frames; CSS moves the strip (transform only), so it keeps rolling while the game is being built,
// which keeps the page's main thread busy for a second or two.
(function () {
  const S = 40, N = 16; // frame size, frames per turn
  const RAMP = ["#4a5a7a", "#7a92b8", "#a8c4e8", "#d4e6fa", "#ffffff"], INK = "#18121e";
  const DIG = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
  const NUMS = [17, 4, 12, 9, 15, 2, 19, 7, 11, 14, 3, 18, 6, 10, 13, 20];

  // the icosahedron: 12 vertices, and the 20 faces are the triangles whose sides all measure 2
  const p = (1 + Math.sqrt(5)) / 2;
  const V = [];
  for (const a of [-1, 1]) for (const b of [-p, p]) V.push([0, a, b], [a, b, 0], [b, 0, a]);
  const F = [];
  const d2 = (i, j) => V[i].reduce((s, v, k) => s + (v - V[j][k]) ** 2, 0);
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++)
    if (Math.abs(d2(i, j) - 4) < 1e-6 && Math.abs(d2(j, k) - 4) < 1e-6 && Math.abs(d2(i, k) - 4) < 1e-6) F.push([i, j, k]);

  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const AXIS = norm([1, 0.75, 0.35]), LIGHT = norm([-0.55, -0.75, 0.9]);
  function rot([x, y, z], a) { // Rodrigues: v turned by a around AXIS
    const [u, v, w] = AXIS, c = Math.cos(a), s = Math.sin(a), d = (u * x + v * y + w * z) * (1 - c);
    return [x * c + (v * z - w * y) * s + u * d, y * c + (w * x - u * z) * s + v * d, z * c + (u * y - v * x) * s + w * d];
  }

  const strip = document.createElement("canvas");
  strip.width = S * N; strip.height = S;
  const cx = strip.getContext("2d"), img = cx.createImageData(S * N, S), px = img.data;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const R = RAMP.map(hex), K = hex(INK);
  const scale = (S / 2 - 3) / Math.hypot(1, p);
  for (let f = 0; f < N; f++) {
    const P = V.map((v) => rot(v, (f / N) * Math.PI * 2));
    const scr = P.map(([x, y, z]) => [S / 2 + x * scale, S / 2 + y * scale, z]);
    // the faces turned toward us, each with its shade (a whole step of the ramp) and its normal
    const faces = [];
    for (const [a, b, c] of F) {
      const A = P[a], B = P[b], C = P[c];
      const n = norm([(B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])]);
      const out = (A[0] + B[0] + C[0]) * n[0] + (A[1] + B[1] + C[1]) * n[1] + (A[2] + B[2] + C[2]) * n[2] > 0 ? 1 : -1;
      const nz = n[2] * out;
      if (nz <= 0) continue;
      const lit = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) * out;
      faces.push({ t: [scr[a], scr[b], scr[c]], shade: Math.max(0, Math.min(4, Math.round(1 + lit * 3.2))), nz });
    }
    const id = new Int8Array(S * S).fill(-1);
    const inTri = (t, x, y) => {
      const [[ax, ay], [bx, by], [qx, qy]] = t;
      const s1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax), s2 = (qx - bx) * (y - by) - (qy - by) * (x - bx), s3 = (ax - qx) * (y - qy) - (ay - qy) * (x - qx);
      return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
    };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      for (let i = 0; i < faces.length; i++) if (inTri(faces[i].t, x + 0.5, y + 0.5)) { id[y * S + x] = i; break; }
    }
    const put = (x, y, c) => { const j = (y * S * N + f * S + x) * 4; px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; px[j + 3] = 255; };
    const at = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? -1 : id[y * S + x]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = at(x, y);
      if (i < 0) { if (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0) put(x, y, K); continue; }
      // where two faces meet, the darkest step: the die's edges
      const edge = (at(x + 1, y) >= 0 && at(x + 1, y) !== i) || (at(x, y + 1) >= 0 && at(x, y + 1) !== i);
      put(x, y, edge ? R[0] : R[faces[i].shade]);
    }
    // the number on the face that looks straight at us, while it rolls
    let best = null;
    for (const fc of faces) if (!best || fc.nz > best.nz) best = fc;
    if (best && best.nz > 0.72) {
      const n = String(NUMS[f]), w = n.length * 4 - 1;
      const gx = Math.round((best.t[0][0] + best.t[1][0] + best.t[2][0]) / 3 - w / 2), gy = Math.round((best.t[0][1] + best.t[1][1] + best.t[2][1]) / 3 - 2.5);
      [...n].forEach((ch, k) => { for (let b = 0; b < 15; b++) if (DIG[+ch][b] === "1") put(gx + k * 4 + (b % 3), gy + ((b / 3) | 0), K); });
    }
  }
  cx.putImageData(img, 0, 0);

  const root = document.getElementById("loading");
  let pending = null;
  try { pending = sessionStorage.getItem("brumafolha.load"); } catch (e) { /* private mode */ }
  root.innerHTML = '<div class="stage"><div class="shadow"></div><div class="hop"><div class="win"></div></div></div><div class="label"></div><div class="bar"><i></i></div>';
  strip.className = "strip";
  root.querySelector(".win").appendChild(strip);
  const label = root.querySelector(".label"), bar = root.querySelector(".bar i");
  label.textContent = pending ? "Lembrando onde você parou..." : "Acendendo a fogueira...";

  /** The game's side: what is being done (k from 0 to 1), then go away. */
  window.Loading = {
    step(text, k) { if (text) label.textContent = text; if (k != null) bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, k))})`; },
    /** Fade out (the screen underneath is ready); resolves when it is gone. */
    hide() {
      bar.style.transform = "scaleX(1)";
      root.classList.add("out");
      return new Promise((res) => setTimeout(() => { root.classList.add("hidden"); res(); }, 700));
    },
    /** Fade back in (before a reload): resolves once it covers the screen. */
    show(text) {
      if (text) label.textContent = text;
      bar.style.transform = "scaleX(0.02)";
      root.classList.remove("hidden");
      void root.offsetWidth; // so the fade starts from transparent
      root.classList.remove("out");
      return new Promise((res) => setTimeout(res, 450));
    },
  };
})();
