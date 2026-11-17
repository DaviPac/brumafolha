// Frame times in a real Firefox window (not headless: there the canvas is drawn in software and the numbers lie).
// Opens Firefox at 1920×1080 on the desktop, drives it over WebDriver BiDi, goes to each place, and reads the F3 meter
// and its own frame intervals for a few seconds.
//
//   node perf-firefox.mjs            (needs a desktop: DISPLAY, and Firefox installed)
//
// Not part of `npm test`: it opens a window and depends on the machine.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serve } from "./lib/server.mjs";
import { ROOT } from "./lib/game.mjs";

const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "brumafolha-ff-"));
fs.writeFileSync(path.join(profile, "user.js"), 'user_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("datareporting.policy.dataSubmissionEnabled", false);\nuser_pref("browser.aboutwelcome.enabled", false);\n');
const srv = await serve(ROOT, 5199);
const ff = spawn("firefox", ["--no-remote", "--profile", profile, `--remote-debugging-port=${PORT}`, "--width=1920", "--height=1080", "about:blank"], { env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ":1" }, stdio: "ignore" });

let ws, seq = 0;
const waiting = new Map();
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
      return;
    } catch { await sleep(500); }
  }
  throw new Error("Firefox não abriu a porta BiDi");
}
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, (d) => (d.error ? rej(new Error(`${method}: ${d.error} ${d.message}`)) : res(d.result))); ws.send(JSON.stringify({ id, method, params })); });

let ctx;
const evaluate = async (expr) => (await send("script.evaluate", { expression: expr, target: { context: ctx }, awaitPromise: true, resultOwnership: "none" })).result;
const val = (r) => (r.type === "string" || r.type === "number" || r.type === "boolean" ? r.value : JSON.stringify(r));
async function waitTrue(expr, ms = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if ((await evaluate(expr)).value === true) return; } catch { /* page loading */ } await sleep(400); }
  throw new Error("tempo esgotado: " + expr);
}
/** A few seconds of frames: the interval between them, and what the F3 meter says. */
async function measure(name) {
  await sleep(2500);
  const r = await evaluate(`new Promise((res) => { const t = []; let last = performance.now(); const f = (now) => { t.push(now - last); last = now; if (t.length < 400) requestAnimationFrame(f); else { t.sort((a, b) => a - b); const avg = t.reduce((a, b) => a + b) / t.length; res(JSON.stringify({ fps: Math.round(1000 / avg), avg: +avg.toFixed(1), p95: +t[Math.floor(t.length * 0.95)].toFixed(1), meter: document.querySelector("div[style*='monospace']")?.textContent ?? "" })); } }; requestAnimationFrame(f); })`);
  const o = JSON.parse(val(r));
  console.log(`${name.padEnd(28)} ${String(o.fps).padStart(4)} q/s  média ${o.avg} ms  p95 ${o.p95} ms   F3: ${o.meter.replace(/\n/g, " | ")}`);
  return o;
}

try {
  await connect();
  await send("session.new", { capabilities: {} });
  ctx = (await send("browsingContext.getTree", {})).contexts[0].context;
  const skip = `(async () => { for (let i = 0; i < 120; i++) { const d = document.querySelector('#dialogue'); if (G.mode === 'explore' && d.classList.contains('hidden')) return true; const o = d.querySelector('.opt'); if (o && !d.classList.contains('hidden')) o.click(); await new Promise(r => setTimeout(r, 250)); } return true; })()`;
  const go = async (q) => { await send("browsingContext.navigate", { context: ctx, url: `${srv.url}?${q}&fps`, wait: "complete" }); await waitTrue("!!(window.G && G.W && G.build && ['explore', 'cutscene', 'dialogue'].includes(G.mode))"); await evaluate(skip); };
  const tp = (tx, ty) => evaluate(`(() => { const l = G.party[G.leader]; l.x = ${tx} * 32 + 16; l.y = ${ty} * 32 + 26; for (const u of G.party) if (u !== l) { u.x = l.x + 4; u.y = l.y + 2; } return true; })()`);
  console.log(`Firefox ${os.hostname()} · janela 1920×1080 · ${(await evaluate("innerWidth + '×' + innerHeight + ' @' + devicePixelRatio")).value}`);
  await go("dev=camp"); await measure("Acampamento (referência)");
  await go("dev=ato1&f=goblin_pact"); await evaluate(skip); await measure("Vau-de-Cardo (referência)");
  await go("dev=ato1c2&f=otavio_found,silas_doubt"); await evaluate(skip);
  await measure("Sul do Bosque, entrada");
  await tp(38, 21); await measure("Sul do Bosque, fogueira");
  await tp(46, 18); await sleep(3000); await evaluate(skip); await measure("Mosteiro, portão e pátio");
  await tp(30, 19); await measure("Mosteiro, jardim");
  await tp(13, 11); await evaluate("(async () => { const S = await import('/src/story.js'); S.interactables().find(i => i.name === 'Porta do claustro').act(); return true; })()");
  await sleep(2500); await evaluate(skip); await measure("Claustro, corredor");
  await tp(28, 11); await measure("Claustro, capela");
} catch (e) { console.error("ERRO", e.message); }
finally {
  try { await send("session.end", {}); } catch { /* */ }
  ff.kill("SIGTERM"); await sleep(1000); try { process.kill(ff.pid, "SIGKILL"); } catch { /* gone */ }
  await srv.close();
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(0);
}
