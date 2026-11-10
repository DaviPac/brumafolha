// Character creation: pick a race, a class and a gender, shape the look, choose the starting gear, spend points on ability scores.
// A live, turnable preview in the middle and the derived character sheet on the right.
import { buildCharacter, SW, SH } from "./art/chars.js";
import { sfx } from "./audio.js";
import { ABILITIES } from "./combat.js";
import {
  RACES, CLASSES, ABILS, ABIL_NAMES, POINTS, mod, signed, pointsSpent, canRaise, canLower, finalScores, derive, specOf,
  newBuild, applyDefaultLook, HAIR_COLORS, HAIR_STYLES, BEARDS, EYES, OUTFITS, CAPES,
  GENDERS, namesFor, className, raceName, defaultGear, weaponProficient,
} from "./rules.js";
import { WEAPONS, ARMORS, SHIELDS, ARMOR_CAT_NAMES, weaponLine } from "./items.js";

const $ = (s, el = document) => el.querySelector(s);
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const TABS = [["race", "Raça"], ["class", "Classe"], ["look", "Aparência"], ["gear", "Equipamento"], ["stats", "Atributos"]];
const POSES = [["idle", "Parado"], ["walk", "Andando"], ["attack", "Ataque"], ["cast", "Magia"]];

let b, tab = "race", dir = 0, pose = "walk", ch = null, raf = 0, onDone = null, companionOf = null;

/** Open the creator; `done(build)` runs on confirm. `companion(build)` names who joins the hero. */
export function openCreator(done, companion) {
  onDone = done; companionOf = companion;
  b = newBuild("humano", "guerreiro");
  const root = $("#creator");
  root.innerHTML = `
    <header><h1>Crie seu herói</h1><p>Raça, classe, aparência e atributos, como numa ficha de mesa.</p></header>
    <div class="cc">
      <aside class="left"><nav class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join("")}</nav><div class="pane"></div></aside>
      <section class="stage">
        <div class="namebox"><input class="name" maxlength="18" spellcheck="false" aria-label="Nome"><button class="reroll" title="Nome aleatório">🎲</button></div>
        <div class="who"></div>
        <div class="podium"><canvas class="preview" width="${SW * 6}" height="${SH * 6}"></canvas></div>
        <div class="turn"><button data-rot="-1" title="Girar">⟲</button>${POSES.map(([k, l]) => `<button data-pose="${k}">${l}</button>`).join("")}<button data-rot="1" title="Girar">⟳</button></div>
      </section>
      <aside class="right sheet"></aside>
    </div>
    <footer><button class="random">🎲 Tudo aleatório</button><button class="go">Começar a aventura</button></footer>`;
  root.classList.remove("hidden");
  root.querySelectorAll("[data-tab]").forEach((el) => (el.onclick = () => { tab = el.dataset.tab; sfx.click(); render(); }));
  root.querySelectorAll("[data-pose]").forEach((el) => (el.onclick = () => { pose = el.dataset.pose; sfx.click(); syncStage(); }));
  root.querySelectorAll("[data-rot]").forEach((el) => (el.onclick = () => { dir = [0, 1, 3, 2][([0, 1, 3, 2].indexOf(dir) + +el.dataset.rot + 4) % 4]; sfx.click(); }));
  const name = $(".name", root);
  name.oninput = () => { b.name = name.value; syncStage(); };
  $(".reroll", root).onclick = () => { b.name = pick(namesFor(b.race, b.gender).filter((n) => n !== b.name)); sfx.dieTick(); render(); };
  $(".random", root).onclick = randomize;
  $(".go", root).onclick = confirm;
  render();
  cancelAnimationFrame(raf);
  const loop = (t) => { drawPreview(t / 1000); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
}

function close() {
  cancelAnimationFrame(raf);
  $("#creator").classList.add("hidden");
}

function confirm() {
  if (!b.name.trim()) b.name = namesFor(b.race, b.gender)[0];
  sfx.levelUp();
  close();
  onDone?.(structuredClone(b));
}

const pick = (a) => a[(Math.random() * a.length) | 0];
function randomize() {
  b = newBuild(pick(Object.keys(RACES)), pick(Object.keys(CLASSES)), pick(["f", "m", "f", "m", "n"]));
  const R = RACES[b.race];
  Object.assign(b.look, {
    skin: (Math.random() * R.skins.length) | 0, hair: (Math.random() * HAIR_COLORS.length) | 0, eyes: (Math.random() * EYES.length) | 0,
    outfit: (Math.random() * OUTFITS.length) | 0, cape: (Math.random() * CAPES.length) | 0,
  });
  if (!R.look.style && b.look.style !== "hood") b.look.style = pick(["short", "long", "bun", "bald"]);
  if (b.gender !== "f" && (b.race === "anao" || b.race === "humano" || b.race === "meioorc")) b.look.beard = pick([null, "short", "long"]);
  const O = CLASSES[b.cls].options;
  b.equip = { main: pick(O.main), ranged: pick(O.ranged), armor: pick(O.armor), shield: pick(O.shield) ? "escudo" : null };
  b.name = pick(namesFor(b.race, b.gender));
  sfx.dieTick();
  render();
}

// ---------------------------------------------------------------- render
function render() {
  const root = $("#creator");
  root.querySelectorAll("[data-tab]").forEach((el) => el.classList.toggle("on", el.dataset.tab === tab));
  const pane = $(".pane", root);
  pane.innerHTML = { race: racePane, class: classPane, look: lookPane, gear: gearPane, stats: statsPane }[tab]();
  wirePane(pane);
  $(".name", root).value = b.name;
  ch = buildCharacter(specOf(b));
  syncStage();
  $(".sheet", root).innerHTML = sheet();
}

function syncStage() {
  const root = $("#creator");
  $(".who", root).textContent = `${raceName(b.race, b.gender)} · ${className(b.cls, b.gender)}`;
  root.querySelectorAll("[data-pose]").forEach((el) => el.classList.toggle("on", el.dataset.pose === pose));
}

const bonusText = (bonus) => Object.entries(bonus).map(([k, v]) => `${signed(v)} ${k}`).join(" · ");

function racePane() {
  const R = RACES[b.race];
  return `<div class="cards">${Object.entries(RACES).map(([k, r]) => `<button class="card ${k === b.race ? "on" : ""}" data-race="${k}"><b>${r.name}</b><small>${bonusText(r.bonus)}</small></button>`).join("")}</div>
    <p class="desc">${R.desc}</p>
    <ul class="traits">${R.traits.map(([n, d]) => `<li><b>${n}.</b> ${d}</li>`).join("")}${R.move ? "" : "<li><b>Deslocamento</b> 6.</li>"}</ul>`;
}

function classPane() {
  const C = CLASSES[b.cls];
  const abil = (k) => { const a = ABILITIES[k]; return `<li title="${a.desc}"><span class="ic">${a.icon}</span>${a.name}</li>`; };
  const armorWord = ["só roupas", "armadura leve", "armadura média", "armadura pesada"][C.profs.armor];
  return `<div class="cards">${Object.entries(CLASSES).map(([k, c]) => `<button class="card ${k === b.cls ? "on" : ""}" data-cls="${k}"><b>${className(k, b.gender)}</b><small>d${c.hitDie} de vida${c.caster ? ` · magia (${c.caster})` : ""}</small></button>`).join("")}</div>
    <p class="desc">${C.desc}</p>
    <p class="gear"><b>Treinamento:</b> armas ${C.profs.martial ? "simples e marciais" : "simples"} · até ${armorWord}${C.profs.shield ? " · escudo" : ""}</p>
    <ul class="abils">${C.abilities.map(abil).join("")}</ul>`;
}

function swatches(key, list, color, opts = {}) {
  return `<div class="swatches">${list.map((item, i) => {
    const c = color(item);
    return `<button class="sw ${b.look[key] === i ? "on" : ""}" data-look="${key}" data-i="${i}" title="${opts.title?.(item, i) ?? ""}" style="${c ? `background:${css(c)}` : ""}">${c ? "" : "✕"}</button>`;
  }).join("")}</div>`;
}
function choices(key, list) {
  return `<div class="chips">${list.map(([v, l]) => `<button class="chip ${b.look[key] === v ? "on" : ""}" data-look="${key}" data-v="${v ?? ""}">${l}</button>`).join("")}</div>`;
}
function lookPane() {
  const R = RACES[b.race];
  return `<h4>Gênero</h4><div class="chips">${GENDERS.map(([v, l]) => `<button class="chip ${b.gender === v ? "on" : ""}" data-gender="${v}">${l}</button>`).join("")}</div>
    <h4>Tom de pele</h4>${swatches("skin", R.skins, (r) => r[2])}
    <h4>Cabelo</h4>${choices("style", HAIR_STYLES)}
    <h4>Cor do cabelo</h4>${swatches("hair", HAIR_COLORS, ([, r]) => r[2], { title: ([n]) => n })}
    <h4>Barba</h4>${choices("beard", BEARDS)}
    <h4>Olhos</h4>${swatches("eyes", EYES, ([, c]) => c, { title: ([n]) => n })}
    <h4>Roupa</h4>${swatches("outfit", OUTFITS, ([, r]) => r[2], { title: ([n]) => n })}
    <h4>Capa</h4>${swatches("cape", CAPES, ([, r]) => (r ? r[2] : null), { title: ([n]) => n })}`;
}

function gearPane() {
  const O = CLASSES[b.cls].options, E = b.equip;
  const row = (slot, key, name, line, desc) => `<button class="card wide ${E[slot] === key ? "on" : ""}" data-gear="${slot}" data-key="${key ?? ""}"><b>${name}</b><small>${line}</small>${desc ? `<em>${desc}</em>` : ""}</button>`;
  const wpn = (slot, k) => {
    if (!k) return row(slot, null, "Nenhuma", "", "");
    const w = WEAPONS[k];
    return row(slot, k, w.name, weaponLine(w) + (weaponProficient(b.cls, k) ? "" : " · sem proficiência"), w.desc);
  };
  const arm = (k) => { const a = ARMORS[k]; return row("armor", k, a.name, `${ARMOR_CAT_NAMES[a.cat]} · CA ${a.base}${a.dexMax ? ` + DES${a.dexMax < 9 ? ` (máx. ${a.dexMax})` : ""}` : ""}`, a.desc); };
  return `<h4>Arma</h4><div class="cards gearlist">${O.main.map((k) => wpn("main", k)).join("")}</div>
    ${O.ranged.length > 1 || O.ranged[0] ? `<h4>Arma à distância</h4><div class="cards gearlist">${O.ranged.map((k) => wpn("ranged", k)).join("")}</div>` : ""}
    <h4>Armadura ou roupa</h4><div class="cards gearlist">${O.armor.map(arm).join("")}</div>
    ${O.shield.includes(true) ? `<h4>Escudo</h4><div class="cards gearlist">${row("shield", null, "Sem escudo", "", "")}${row("shield", "escudo", SHIELDS.escudo.name, "+2 CA", SHIELDS.escudo.desc)}</div>` : ""}
    <p class="hint">Mais equipamento aparece pelo caminho. Troque a qualquer hora na Bolsa (I).</p>`;
}

function statsPane() {
  const left = POINTS - pointsSpent(b.base), sc = finalScores(b), bonus = RACES[b.race].bonus;
  return `<p class="points">Pontos restantes: <b class="${left ? "" : "zero"}">${left}</b> / ${POINTS}</p>
    <table class="stats"><thead><tr><th></th><th>Base</th><th>Raça</th><th>Total</th><th>Mod</th></tr></thead><tbody>
    ${ABILS.map((k) => `<tr class="${CLASSES[b.cls].scores[k] >= 14 ? "key" : ""}"><th title="${ABIL_NAMES[k]}">${k}<small>${ABIL_NAMES[k]}</small></th>
      <td class="pb"><button data-dn="${k}" ${canLower(b.base, k) ? "" : "disabled"}>−</button><span>${b.base[k]}</span><button data-up="${k}" ${canRaise(b.base, k) ? "" : "disabled"}>+</button></td>
      <td class="rb">${bonus[k] ? signed(bonus[k]) : ""}</td><td class="tot">${sc[k]}</td><td class="md">${signed(mod(sc[k]))}</td></tr>`).join("")}
    </tbody></table>
    <p class="hint">Cada atributo começa em 8 e vai até 15 antes do bônus da raça. Os destacados são os principais da classe.</p>
    <button class="chip suggest">Distribuição sugerida para ${CLASSES[b.cls].name}</button>`;
}

function wirePane(pane) {
  pane.querySelectorAll("[data-race]").forEach((el) => (el.onclick = () => {
    if (b.race === el.dataset.race) return;
    const oldNames = namesFor(b.race, "n");
    b.race = el.dataset.race; applyDefaultLook(b, "race");
    if (!b.name || oldNames.includes(b.name)) b.name = namesFor(b.race, b.gender)[0];
    sfx.select(); render();
  }));
  pane.querySelectorAll("[data-cls]").forEach((el) => (el.onclick = () => {
    if (b.cls === el.dataset.cls) return;
    b.cls = el.dataset.cls; b.base = { ...CLASSES[b.cls].scores }; applyDefaultLook(b, "class"); defaultGear(b);
    sfx.select(); render();
  }));
  pane.querySelectorAll("[data-look]").forEach((el) => (el.onclick = () => {
    const k = el.dataset.look;
    b.look[k] = el.dataset.i != null ? +el.dataset.i : el.dataset.v || null;
    sfx.click(); render();
  }));
  pane.querySelectorAll("[data-gender]").forEach((el) => (el.onclick = () => {
    const was = namesFor(b.race, "n").includes(b.name);
    b.gender = el.dataset.gender;
    if (b.gender === "f") b.look.beard = null;
    if (!RACES[b.race].look.style && !CLASSES[b.cls].look.style) b.look.style = b.gender === "f" ? "long" : b.gender === "m" && b.look.style === "long" ? "short" : b.look.style;
    if (was) b.name = namesFor(b.race, b.gender)[0];
    sfx.click(); render();
  }));
  pane.querySelectorAll("[data-gear]").forEach((el) => (el.onclick = () => {
    b.equip[el.dataset.gear] = el.dataset.key || null;
    sfx.click(); render();
  }));
  pane.querySelectorAll("[data-up]").forEach((el) => (el.onclick = () => { b.base[el.dataset.up]++; sfx.click(); render(); }));
  pane.querySelectorAll("[data-dn]").forEach((el) => (el.onclick = () => { b.base[el.dataset.dn]--; sfx.click(); render(); }));
  const sug = pane.querySelector(".suggest");
  if (sug) sug.onclick = () => { b.base = { ...CLASSES[b.cls].scores }; sfx.click(); render(); };
}

function sheet() {
  const R = RACES[b.race], C = CLASSES[b.cls], d = derive(b);
  const abilities = [...C.abilities.filter((k) => k !== "shoot"), ...(d.bow ? ["shoot"] : [])];
  const stat = (label, v, sub = "") => `<div class="st"><span>${label}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  const shown = Object.entries(d.skills).filter(([s]) => d.proficient.has(s) || s === "Persuasão" || s === "Intuição");
  const mate = companionOf?.(b);
  return `<h3>Ficha</h3>
    <div class="stats4">${stat("PV", d.maxHp, `+${d.hpPerLevel}/nível`)}${stat("CA", d.ac, d.acNote)}${stat("Iniciativa", signed(d.init))}${stat("Movimento", d.move)}</div>
    <h4>Ataques</h4>
    <ul class="atk"><li><b>${d.weapon.name}</b> ${signed(d.atk)} para acertar · ${d.dmg} dano${d.reach > 1 ? " · alcance 2" : ""}</li>
      ${d.bow ? `<li><b>${d.bow.name}</b> ${signed(d.bow.atk)} · ${d.bow.dmg} · alcance ${d.bow.range}</li>` : ""}
      ${d.spellAtk != null ? `<li><b>Magia</b> ${signed(d.spellAtk)} para acertar · ${d.maxSlots} espaços de 1º círculo</li>` : ""}</ul>
    <h4>Habilidades</h4>
    <div class="icons">${abilities.map((k) => `<span title="${ABILITIES[k].name}: ${ABILITIES[k].desc}">${ABILITIES[k].icon}</span>`).join("")}</div>
    ${d.notes.map((n) => `<p class="warn">⚠ ${n}</p>`).join("")}
    ${Object.keys(d.fx).length ? `<p class="passive">${[d.weapon, ARMORS[b.equip.armor]].filter((x) => x?.fx).map((x) => `<b>${x.name}:</b> ${x.desc}`).join("<br>")}</p>` : ""}
    ${C.sneak ? `<p class="passive"><b>Ataque furtivo:</b> +1d6 uma vez por turno se um aliado estiver ao lado do alvo.</p>` : ""}
    <h4>Perícias</h4>
    <ul class="skills">${shown.map(([s, v]) => `<li class="${d.proficient.has(s) ? "pro" : ""}"><span>${s}</span><b>${signed(v)}</b></li>`).join("")}</ul>
    <h4>Traços</h4>
    <ul class="traits small">${R.traits.map(([n, t]) => `<li><b>${n}.</b> ${t}</li>`).join("")}</ul>
    ${mate ? `<p class="mate">Companheiro: <b>${mate}</b></p>` : ""}`;
}

// ---------------------------------------------------------------- preview
function drawPreview(t) {
  const cv = $("#creator .preview");
  if (!cv || !ch) return;
  const x = cv.getContext("2d");
  x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, cv.width, cv.height);
  // a soft shadow under the feet
  x.fillStyle = "rgba(0,0,0,0.35)";
  x.beginPath(); x.ellipse(cv.width / 2, 34 * 6 - 2, 42, 12, 0, 0, Math.PI * 2); x.fill();
  let f = 4, bob = 0;
  if (pose === "walk") f = Math.floor(t * 6) % 4;
  else if (pose === "attack") f = Math.floor(t * 1.5) % 2 ? 5 : 4;
  else if (pose === "cast") f = Math.floor(t * 1.5) % 2 ? 6 : 4;
  else bob = Math.floor(t * 1.6) % 2;
  // walking and standing the weapon is put away, as in the game; attacking and casting draw it
  const set = (pose === "idle" || pose === "walk") && ch.sheathed ? ch.sheathed : ch;
  x.drawImage(set.frames[dir][f], 0, bob * 6, SW * 6, SH * 6);
}
