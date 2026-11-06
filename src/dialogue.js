// Conversations with choices and d20 skill checks, the tabletop way.
import { G } from "./state.js";
import { rollDie } from "./util.js";
import { updateQuest, toast, log, updateParty } from "./ui.js";
import { sfx } from "./audio.js";

const $ = (s) => document.querySelector(s);

/** Show the big d20, roll it, resolve with { roll, total, ok }. */
export function skillCheck(skill, who, bonus, dc) {
  return new Promise((resolve) => {
    const box = $("#dice");
    box.classList.remove("hidden");
    box.querySelector(".skill").textContent = `${skill} · ${who}`;
    box.querySelector(".dc").textContent = `Classe de Dificuldade ${dc}  ·  bônus ${bonus >= 0 ? "+" : ""}${bonus}`;
    const d = box.querySelector(".d20"), num = box.querySelector(".num"), res = box.querySelector(".result");
    res.textContent = ""; res.className = "result";
    d.classList.add("spin");
    const r = rollDie(20);
    let n = 0;
    const iv = setInterval(() => { num.textContent = rollDie(20); sfx.dieTick(); if (++n > 16) finish(); }, 60);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearInterval(iv);
      d.classList.remove("spin");
      num.textContent = r;
      const total = r + bonus, ok = r === 20 || (r !== 1 && total >= dc);
      res.textContent = r === 20 ? "Sucesso crítico!" : r === 1 ? "Falha crítica!" : ok ? `Sucesso  (${total})` : `Falha  (${total})`;
      res.className = "result " + (ok ? "ok" : "bad");
      ok ? sfx.success(r === 20) : sfx.fail();
      setTimeout(() => {
        box.onclick = () => { box.onclick = null; box.classList.add("hidden"); resolve({ roll: r, total, ok }); };
      }, 250);
    }
  });
}

let current = null;

export function openDialogue(npc, tree, startId = "start") {
  G.mode = "dialogue";
  sfx.talk();
  current = { npc, tree, used: new Set() };
  const el = $("#dialogue");
  el.classList.remove("hidden");
  const pc = el.querySelector(".portrait canvas");
  pc.width = npc.portrait.width; pc.height = npc.portrait.height;
  const ctx = pc.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(npc.portrait, 0, 0);
  el.querySelector(".name").textContent = npc.name;
  show(startId);
}

function typeText(el, text) {
  el.textContent = "";
  let i = 0;
  clearInterval(el._iv);
  el._iv = setInterval(() => { el.textContent = text.slice(0, (i += 2)); if (i >= text.length) clearInterval(el._iv); }, 16);
  el.onclick = () => { clearInterval(el._iv); el.textContent = text; };
}

function show(id) {
  const node = typeof current.tree[id] === "function" ? current.tree[id]() : current.tree[id];
  const el = $("#dialogue");
  typeText(el.querySelector(".text"), node.text);
  const opts = el.querySelector(".options");
  opts.innerHTML = "";
  node.options.filter((o) => !o.if || o.if()).forEach((o, i) => {
    const d = document.createElement("div");
    const key = id + ":" + i;
    d.className = "opt" + (o.once && current.used.has(o.label) ? " used" : "");
    const tag = o.check ? `<span class="tag chk">[${o.check.skill} CD ${o.check.dc}]</span> ` : o.tag ? `<span class="tag">[${o.tag}]</span> ` : "";
    d.innerHTML = `${i + 1}. ${tag}${o.label}`;
    d.onclick = async () => {
      sfx.click();
      if (o.once) current.used.add(o.label);
      if (o.check) {
        const who = G.party.find((p) => p.key === o.check.who) ?? G.party[0];
        const res = await skillCheck(o.check.skill, who.name, who.skills[o.check.skill] ?? 0, o.check.dc);
        log(`${who.name} — ${o.check.skill}: ${res.roll}+${who.skills[o.check.skill] ?? 0} = ${res.total} vs CD ${o.check.dc} · ${res.ok ? "sucesso" : "falha"}`, res.ok ? "heal" : "miss");
        const next = res.ok ? o.pass : o.fail;
        if (typeof next === "function") next();
        return go(res.ok ? o.passTo : o.failTo);
      }
      o.do?.();
      go(o.to);
    };
    opts.appendChild(d);
  });
  current.keys = node.options;
}

function go(id) {
  if (!id || id === "end") return closeDialogue();
  show(id);
}

export function closeDialogue() {
  $("#dialogue").classList.add("hidden");
  current = null;
  G.mode = "explore";
  updateQuest();
  updateParty();
  G.hooks.afterDialogue?.();
}

export function dialogueKey(n) {
  if (!current) return;
  const opts = [...document.querySelectorAll("#dialogue .opt")];
  opts[n - 1]?.click();
}

// ---------- Maren the fisher
export function marenTree() {
  const q = G.quest;
  return {
    start: () => {
      if (q.stage === 0)
        return {
          text: "Ah! Viajantes de verdade, graças à Senhora das Marés. Goblins tomaram as velhas Ruínas de Velmoor, ao norte. Roubam minhas redes, assustam os peixes, e ontem quase levaram o barco.",
          options: [
            { label: "Nós cuidamos dos goblins.", to: "accept" },
            { label: "Um trabalho desses merece pagamento adiantado.", check: { skill: "Persuasão", dc: 12, who: "hero" }, once: true, pass: () => { G.potions += 2; toast("+2 Poções de cura"); }, passTo: "paid", failTo: "notpaid" },
            { label: "Você está escondendo alguma coisa.", check: { skill: "Intuição", dc: 10, who: "mage" }, once: true, pass: () => { q.flags.grandson = true; }, passTo: "secret", failTo: "nosecret" },
            { label: "Quantos são?", tag: "Perguntar", to: "count" },
            { label: "Agora não.", to: "end" },
          ],
        };
      if (q.stage === 1)
        return { text: "As ruínas ficam ao norte, sigam a estrada. Cuidado com o chefe deles, um brutamontes chamado Gorza.", options: [{ label: "Estamos indo.", to: "end" }] };
      if (q.stage === 2)
        return {
          text: q.flags.grandsonFound ? "Vocês... trouxeram notícias do Tomé? Ele está vivo! Escondido nas ruínas esse tempo todo, o tolo. Não tenho como agradecer." : "A fumaça das ruínas parou! Vocês conseguiram mesmo. O lago está em paz de novo.",
          options: [{ label: "Foi um prazer.", do: () => G.hooks.questDone?.(), to: "reward" }],
        };
      return { text: "Voltem quando quiserem. Sempre haverá peixe assado pra vocês.", options: [{ label: "Até mais, Maren.", to: "end" }] };
    },
    accept: { text: "Que os deuses guiem suas lâminas. A estrada ao norte leva direto às ruínas. E vi uma patrulha deles rondando a trilha.", options: [{ label: "Vamos lá.", do: () => { q.stage = 1; q.flags.patrolSeen = true; }, to: "end" }] },
    paid: { text: "Hmpf... justo. Tomem, duas poções do meu estoque. Mas eu quero aqueles goblins longe daqui!", options: [{ label: "Combinado.", do: () => { q.stage = 1; q.flags.patrolSeen = true; }, to: "end" }, { label: "Mais uma pergunta.", to: "start" }] },
    notpaid: { text: "Adiantado? Ha! Paguem-se com o que os goblins roubaram de mim, se acharem.", options: [{ label: "Justo.", do: () => { q.stage = 1; q.flags.patrolSeen = true; }, to: "end" }, { label: "Mais uma pergunta.", to: "start" }] },
    secret: { text: "...Meu neto, Tomé. Foi atrás das redes e não voltou. Se o virem nas ruínas, por favor... tragam ele de volta.", options: [{ label: "Vamos encontrá-lo.", to: "start" }] },
    nosecret: { text: "Escondendo? Só o cheiro de peixe, querida. Hah!", options: [{ label: "Certo...", to: "start" }] },
    count: { text: "Uns quatro ou cinco nas ruínas. Um deles mexe com fogo, um xamã. Se fosse eu, derrubava esse primeiro.", options: [{ label: "Bom saber.", to: "start" }] },
    reward: { text: "Tomem, é pouco, mas é de coração: 50 peças de ouro. E o barco é de vocês quando quiserem pescar.", options: [{ label: "[Fim do protótipo] Obrigado, Maren.", to: "end" }] },
  };
}

export function tomeTree() {
  return {
    start: {
      text: "Não me machuquem! Ah... vocês não são goblins. Eu sou o Tomé. Fiquei escondido aqui atrás da coluna desde que eles chegaram.",
      options: [{ label: "Sua avó está te esperando no cais.", do: () => { G.quest.flags.grandsonFound = true; G.hooks.tomeLeaves?.(); }, to: "bye" }],
    },
    bye: { text: "A vó Maren! Vou correndo pra lá. Obrigado, de verdade!", options: [{ label: "Vá com cuidado.", to: "end" }] },
  };
}
