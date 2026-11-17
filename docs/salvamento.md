# Salvamento

> Estado: **implementado** (etapas 1 a 4 da seção 11), em `src/save/`. A seção 12, no fim, diz o que ficou diferente
> do plano original e o que falta. As decisões da seção 10 já foram tomadas:
> 1. **Carregar pode mudar o resultado do dado** (como no BG3). Não há gerador com semente.
> 2. **Não se salva durante cenas.** O botão diz por quê; F5 também.
> 3. **Saves automáticos** como na seção 7.

## 1. O que se quer

Salvar **todo** o estado do jogo, a qualquer momento: explorando, no meio de um diálogo, num teste de d20, em
combate, dentro de uma cena. Vários salvamentos, de vários personagens. E, acima de tudo, um salvamento que não
corrompa, não perca progresso e, quando algo dá errado, falhe de um jeito que o jogador entenda e possa contornar.

Referência: Baldur's Gate 3. Vale notar o que o BG3 faz de verdade: salva em exploração e em combate, mas
**não** deixa salvar no meio de um diálogo nem de uma cena. Este plano vai além disso (permite salvar em diálogos
e em cenas), com um cuidado explicado na seção 5.5.

## 2. Por que não é simples aqui

O jogo foi escrito sem salvamento em mente, e o estado está espalhado em lugares que não viram JSON:

| Onde | O que guarda | Problema |
|---|---|---|
| `G` (`src/state.js`) | modo, grupo, inimigos, NPCs, flags `G.f`, itens, lembranças, ouro, relógio | Mistura dados com objetos vivos: unidades têm canvases (`ch`, `portrait`), o mapa `G.W` tem a arte do chão |
| Unidades | posição, PV, nível, equipamento, condições, `talk` | `talk` é uma **função** (closure). Unidades mudam de lista (de `enemies` para `npcs`, de `npc` para `party`) |
| Objetos do mapa | fogueira apagada (`out`), estátua acesa (`lit`), torre dissolvendo (`clip`), escondido, transparência | Mudados direto pela história, sem registro do que mudou |
| `story.js` e `act1.js` | `esc` (a fuga), `boatRide`, `statuePort`, `relicGroup`, `deerT`, `tweens`, `timers` | Variáveis soltas no módulo, invisíveis de fora |
| Cenas roteirizadas | 42 cenas `scene(async () => …)` com `await say(...)` | Uma função `async` parada no meio **não pode ser salva**: o JavaScript não serializa a continuação de uma promise |
| `later(seg, fn)` | 11 timers da história (a fogueira verde que se apaga em 40 s, o descanso na taverna...) | Closures com tempo restante |
| `dialogue.js` | a conversa aberta, o nó atual, as opções já usadas | A árvore é um objeto com funções |
| `combat.js` | ordem de iniciativa, turno, rodada, quem já agiu | O turno da IA é `async`, com animações no meio |

A boa notícia: **o mundo é determinístico.** Nenhum mapa usa `Math.random` para se construir (conferido: só
dados, efeitos e tremidas de câmera usam). Construir o vale duas vezes dá o mesmo vale. Então o salvamento só precisa
guardar **o que mudou** em relação ao mundo recém-construído, não o mundo inteiro.

E já existe um embrião: `snapshot()`/`retry()` em `main.js`, que guarda o estado antes de uma luta para o "tentar
de novo". O salvamento generaliza essa ideia.

## 3. Princípios

1. **Um save é só dados.** JSON puro, sem canvas, sem função, sem referência a objeto. Tudo o que é arte se
   reconstrói a partir de dados (`buildCharacter(spec)`, `propArt(o)`).
2. **Carregar = recarregar a página e reconstruir.** Carregar não "desfaz" o estado em memória: a página recarrega
   com `?load=<id>`, o jogo sobe do zero como sempre, e o save é aplicado sobre o mundo recém-construído. É a parte
   mais importante do plano: elimina de uma vez timers pendentes, promises penduradas, efeitos no meio, listeners
   duplicados e qualquer resto do jogo anterior. Custa o tempo de um carregamento (um a dois segundos), que é
   aceitável para a robustez que traz.
3. **Identificadores estáveis.** Toda unidade e todo objeto que a história pode mudar ganha um `id` fixo,
   atribuído na construção do mapa (`vale:goblin:3`, `vale:obj:campfire:0`). O save fala em ids, nunca em índices de
   lista nem em referências.
4. **Cada módulo declara o próprio estado.** Um registro central (`src/save/registry.js`) onde cada módulo com
   estado se inscreve com `{ nome, salvar(), carregar(dados) }`. Nada de estado solto que o salvamento não conheça.
5. **Salvar só em pontos estáveis, e adiar quando não é.** Se o jogador pede para salvar no meio de uma animação, o
   jogo responde "Salvando ao fim desta ação" e salva no próximo ponto estável. O jogador nunca ouve "não dá".
6. **Gravação atômica, verificada e com cópia anterior.** Um save nunca é sobrescrito no lugar (seção 6).
7. **Versionado.** Todo save tem `versao` do formato; versões antigas passam por migrações em sequência.
8. **Um save que falha nunca derruba o jogo**, nem ao salvar nem ao carregar.

## 4. O formato

```jsonc
{
  "formato": 1,                 // versão do formato, para as migrações
  "jogo": "0.4.0",              // versão do jogo que gravou (informativa)
  "campanha": "c-7f3a…",        // a partida (um herói); agrupa os saves como no BG3
  "gravadoEm": "2026-11-17T14:02:11Z",
  "tempoDeJogo": 4210,          // segundos
  "rng": { "semente": 91823, "passo": 4471 },   // ver 5.3
  "momento": { "tipo": "dialogo", … },          // onde o jogo estava (seção 5)
  "mapa": { "id": "vale", "relogio": 15.2, "alvoRelogio": null, "luz": null, "tinta": null, "musica": null },
  "grupo": { "membros": ["heroi", "lyra"], "lider": 0, "seguidores": ["tome"] },
  "heroi": { "build": { … } },  // a ficha do criador: raça, classe, aparência, atributos
  "unidades": {                 // só o que difere do mapa recém-construído
    "heroi": { "x": 512, "y": 1210, "dir": 3, "pv": 14, "nivel": 2, "xp": 410, "equip": { … }, "usadoNoDescanso": { … }, "condicoes": ["inspirado"] },
    "vale:goblin:3": { "lista": "npcs", "time": "npc", "fala": "goblin_refugiado", "pv": 7 },
    "vale:fiapo": { "sumiu": true }
  },
  "objetos": { "vale:obj:campfire:2": { "apagada": true }, "relicario:s1": { "acesa": true } },
  "flags": { … },               // G.f inteiro (já é JSON)
  "itens": [ … ], "lembrancas": [ … ], "aprovacao": { … }, "ouro": 52, "pocoes": 2,
  "tutorial": { "ligado": true, "vistas": ["move", "interact"] },
  "modulos": { "historia": { "fuga": { … }, "barco": { … } }, "ato1": { … } },
  "timers": [{ "nome": "fogueira_verde_apaga", "resta": 22.4 }],
  "checkpointDaLuta": { … }     // para o "tentar de novo" funcionar mesmo depois de carregar dentro de uma luta
}
```

Tamanho esperado: 20 a 80 KB por save. A miniatura (seção 7) fica fora, nos metadados.

## 5. Cada momento do jogo

O campo `momento` diz o que estava acontecendo. Ao carregar, o jogo reconstrói o mundo e depois **retoma** o momento.

### 5.1 Explorando

O caso fácil: posições, direção, quem lidera. Retomar = pôr todo mundo no lugar e voltar ao modo `explore`.

### 5.2 Diálogo com um NPC

Hoje uma árvore de diálogo é um objeto criado por uma função (`talk: marenTree`), cheio de closures. A mudança:

- Toda árvore ganha um **nome** num registro (`DIALOGOS.maren = marenTree`). `npc.talk` passa a guardar o nome, não
  a função. As árvores de NPC (umas duas dúzias, entre o prólogo e o Ato I) ganham nome uma vez.
- O save guarda `{ tipo: "dialogo", arvore: "maren", no: "pescaria", quem: "vale:maren", usadas: ["n2", "n5"] }`.
- Os efeitos de uma opção (`do`, `pass`, `fail`) rodam **quando ela é escolhida**. Salvar com um nó na tela é
  consistente: o que já foi escolhido já está nas flags, o que está na tela ainda não aconteceu.

Retomar = abrir a mesma árvore no mesmo nó.

### 5.3 Teste de d20

O resultado é sorteado antes da animação. Duas regras:

- Durante a animação do dado, o salvamento é **adiado** até o resultado ser aplicado.
- **Gerador com semente**: todos os sorteios de regra (`rollDie`) passam a sair de um gerador com semente salva no
  save. Carregar repete o mesmo dado. Isso impede que salvar e carregar mude um resultado por acidente, e de
  quebra impede o "salva e recarrega até passar".
  *Decisão sua* (seção 10): o BG3 permite rolar de novo recarregando. Dá para permitir também, sorteando uma semente
  nova ao carregar.

### 5.4 Combate

Pontos estáveis: o início de qualquer turno, e qualquer momento em que um membro do grupo está esperando a ordem do
jogador (`G.combat.busy === false`). Durante um ataque, uma magia ou o turno da IA, o salvamento é adiado até o fim
da ação.

O save guarda: a ordem de iniciativa (ids), de quem é a vez, a rodada, o que cada um já usou no turno (ação, ação
bônus, movimento restante), PV, espaços de magia, condições (Esquecido, Zombado, Fúria, Marca...), posições em
casas, as opções da luta (surpresa etc.) e o `checkpointDaLuta` para o "tentar de novo".

Os eventos de turno da história (`turnStart`: aliados que chegam na rodada 2, a voz que para o tempo) já dependem de
flags e da rodada, então se repetem certo depois de carregar. Cada um precisa ser conferido nesse sentido (seção 9).

### 5.5 Cenas roteirizadas (o caso difícil)

As 42 cenas são funções `async` (`await say(...)`, `await E.walk(...)`, `await E.sleep(...)`). Uma função parada no
meio não se serializa. Há duas saídas:

**A. Checkpoint de cena (recomendado para começar).** Cada `scene()` ganha um nome (`scene("gorza", async () => …)`)
e, ao começar, tira uma fotografia do estado (como o `snapshot()` de hoje). Se o jogador salvar no meio da cena, o
save grava **a fotografia da entrada** mais o nome da cena; ao carregar, a cena **começa de novo**. O jogador perde,
no máximo, as falas daquela cena, nunca uma escolha que já tenha consequência fora dela. Para isso, cada cena
precisa poder começar do zero a partir das flags, o que a maioria já faz (`if (F.dream_woman) return;` logo no início).
As que não fazem são ajustadas.

**B. Roteiro em passos (depois, se fizer falta).** Reescrever as cenas como listas de passos (`["fala", "maren",
"..."], ["anda", "heroi", 12, 30], ["se", "goblin_pact", …]`) executadas por um interpretador que sabe em que passo
está. Aí dá para salvar e retomar na fala exata. É mais trabalho (as 42 cenas) e só vale se A incomodar na prática.

O diálogo dentro de uma cena (`ask`, `lines`, `say`) segue a regra da cena, não a da 5.2.

### 5.6 Timers da história

Os 11 `later(seg, fn)` viram de dois tipos:

- **Cosméticos** (dicas, letreiros, "gritos na névoa"): não vão para o save. Perder um deles ao carregar não muda nada.
- **Da história** (a fogueira verde que apaga em 40 s, o descanso na taverna): ganham nome num registro
  (`later(40, "fogueira_verde_apaga")`) e vão para o save com o tempo que falta.

### 5.7 Onde não se salva

Menu inicial, prelúdio e criador de personagem (ainda não há partida), a tela de derrota e a tela final. O botão de
salvar aparece desligado, dizendo por quê.

## 6. Gravação à prova de erro

**Onde**: IndexedDB (cabe muito mais que o `localStorage` e tem transações). Banco `brumafolha`, com dois depósitos:
`saves` (os metadados, leves, para listar) e `dados` (o JSON de cada save).

**Salvar**, passo a passo:

1. Montar o JSON. Se der erro aqui, nada foi tocado: avisar e seguir jogando.
2. Validar o próprio JSON contra o esquema (o mesmo validador do carregamento). Um save que o jogo não conseguiria
   ler não chega a ser gravado.
3. Calcular a soma de verificação (SHA-256 com `crypto.subtle`).
4. Gravar os dados com uma **chave nova**, nunca por cima da antiga.
5. Ler de volta e conferir a soma.
6. Numa única transação, apontar os metadados do slot para a chave nova, guardando a anterior como **cópia de
   segurança**. Só então apagar a geração mais antiga.

Se a aba fechar no meio, o pior caso é sobrar um dado órfão, que é limpo na próxima abertura. O slot continua
apontando para um save inteiro.

**Carregar**:

1. Conferir a soma. Se não bater: tentar a cópia de segurança e avisar ("O save principal estava danificado;
   carregamos a versão anterior, de 14:02").
2. Migrar o formato, se for antigo.
3. Validar o esquema (tipos, ids conhecidos, valores dentro dos limites).
4. Recarregar a página com `?load=<id>`, construir o mundo, aplicar o save dentro de um `try`.
5. Conferir invariantes: grupo não vazio, líder vivo, ninguém dentro de parede (se estiver, vai para a casa livre
   mais próxima e isso fica registrado no console), modo válido.
6. Se qualquer passo falhar: voltar ao menu com uma mensagem clara e oferecer a cópia de segurança. Nunca uma tela
   preta.

**Outros cuidados**:

- `navigator.storage.persist()` na primeira gravação, para o navegador não apagar os saves quando faltar espaço.
- Espaço cheio: mensagem clara, sugerindo apagar saves antigos, com a lista à mão.
- Sem IndexedDB (alguns modos privados): cai para `localStorage`, avisando que os saves podem não sobreviver ao
  fechamento do navegador.
- Duas abas abertas: `navigator.locks` impede que as duas gravem o mesmo slot ao mesmo tempo.
- **Exportar e importar** um save como arquivo (`.brumafolha`). É a única proteção contra o navegador limpar os
  dados do site, e serve para levar um save para outra máquina.
- Nada de salvar em `beforeunload`: o navegador não garante que a gravação termine.

## 7. Vários saves

Como no BG3, os saves se agrupam por **campanha** (uma partida, um herói). A tela de carregar mostra as campanhas
com o retrato do herói e, dentro de cada uma, os saves do mais novo para o mais antigo.

Tipos de save:

| Tipo | Quantos | Quando |
|---|---|---|
| **Manual** | ilimitados, com nome opcional | menu de pausa → Salvar, em qualquer momento salvável |
| **Rápido** | 1 por campanha (com a cópia anterior) | `F5` salva, `F9` carrega (no gamepad, pelo menu) |
| **Automático** | os 3 últimos por campanha, em rodízio | ao trocar de mapa, antes de cada luta, depois das cenas grandes, e a cada 10 min explorando |

Cada save mostra: miniatura da tela (192×108, gravada nos metadados), lugar ("Lago Espelhado"), missão atual,
nível e retratos do grupo, tempo de jogo, data. Sobrescrever e apagar pedem confirmação. **Continuar**, no menu
inicial, carrega o save mais recente de qualquer campanha.

## 8. Mudanças no código, por arquivo

- `src/save/` (novo): `registry.js` (os módulos com estado), `serialize.js` (montar e aplicar), `schema.js`
  (validar), `migrate.js`, `store.js` (IndexedDB, somas, cópias, travas), `rng.js` (o gerador com semente).
- `state.js`: o que hoje fica solto nos módulos e precisa ir para o save passa a viver aqui ou num `salvar()` do
  próprio módulo.
- `main.js`: ids estáveis em `unit()` e em `buildMap()`; `?load=` no `boot()`; `snapshot()`/`retry()` passam a usar
  o mesmo serializador.
- `story.js` e `act1.js`: nomes nas cenas, árvores e timers; `salvar()/carregar()` para `esc`, `boatRide`,
  `statuePort`, `relicGroup`, `deerT`; `npc.talk` vira nome.
- `dialogue.js`: expor o diálogo aberto (árvore, nó, usadas) e reabrir a partir disso.
- `combat.js`: expor e restaurar `G.combat`; o sinal de "ponto estável".
- `util.js`: `rollDie` passa pelo gerador com semente.
- Interface: telas de Salvar e Carregar (pausa e menu inicial), `F5`/`F9`, aviso de "salvando...".

## 9. Como saber que funciona

1. **Ida e volta**: salvar → carregar → salvar de novo tem que dar o mesmo JSON (fora a data). Rodado em todos os
   pontos abaixo.
2. **Roteiro automático** (Playwright, como os que já testam o prólogo e o Ato I): jogar o prólogo e o capítulo,
   salvando e carregando em cada cena, cada diálogo, cada luta (no turno do jogador e no meio do turno da IA) e cada
   teste de d20, e conferir que o jogo continua até o fim.
3. **Saves estragados**: cortar o arquivo pela metade, trocar bytes, apagar campos, ids que não existem, versões
   antigas e futuras. Nenhum pode travar o jogo: todos terminam em mensagem e oferta da cópia.
4. **Determinismo**: construir os mapas duas vezes e conferir que os ids são os mesmos. Se alguém um dia puser
   `Math.random` na construção de um mapa, este teste quebra.
5. **Cobertura do registro**: um teste que procura variáveis de módulo mutáveis (`let` no topo, objetos alterados)
   fora do registro e falha se achar alguma. É o que impede que um estado novo seja esquecido no futuro.
6. **Desempenho**: salvar em menos de 50 ms (fora a gravação, que é assíncrona e não trava o jogo).

## 10. Decisões que são suas

1. **Recarregar muda o dado?** Recomendo semente salva (carregar repete o resultado), mas o BG3 deixa rolar de novo.
2. **Salvar dentro de cena**: começar com o checkpoint de cena (5.5 A, recomendado), aceitando que carregar
   recomeça a cena, ou já ir para o roteiro em passos (5.5 B), que é bem mais trabalho.
3. **Saves automáticos**: frequência e quantidade da tabela da seção 7, ou outra.
4. **Modo "uma vida só"** (um save por campanha, sem carregar depois de uma derrota): fica para depois, ou nunca.

## 11. Ordem de trabalho

1. **Base**: ids estáveis, registro, serializador e validador, IndexedDB com gravação atômica, salvar e carregar
   **explorando**, telas de Salvar e Carregar, Continuar no menu. Já entrega o jogo salvável na maior parte do tempo.
2. **Diálogos e combate**: árvores com nome, gerador com semente, combate nos pontos estáveis, salvamento adiado.
3. **Cenas e timers**: checkpoint de cena e timers nomeados. A partir daqui, salva-se em qualquer momento.
4. **Conforto**: rápido e automático, miniaturas, campanhas, exportar e importar.
5. **Testes** (correm junto de cada etapa, não no fim): ida e volta, roteiro automático, saves estragados, determinismo.

## 12. Como ficou

O que foi feito, arquivo por arquivo:

- `src/save/codec.js`: ids estáveis, a fotografia de cada unidade e objeto logo depois que o mapa é construído, e o
  diff contra ela. Funções viram nomes: as que estão na fotografia ganham o nome do lugar onde estavam
  (`vau:3.talk`), então os diálogos de NPC não precisaram ser renomeados um a um; as poucas que a história atribui
  depois (`otavioTree`, o embalar do Esvaído, o gesto dos Esvaídos do Ato I) foram nomeadas à mão com `nameFn`.
- `src/save/game.js`: montar o save e aplicá-lo num jogo recém-carregado, e as invariantes.
- `src/save/store.js`: IndexedDB, gravação atômica com SHA-256, cópia anterior, trava entre abas, limpeza de órfãos,
  `localStorage` como reserva.
- `src/save/schema.js`: validação e migrações.
- `src/save/saves.js`: quando se pode salvar, o salvamento adiado, rápido e automático, as telas de Salvar e
  Carregar, exportar e importar.
- `story.js` / `act1.js`: `setTimeout` virou `soon()` (contado: um save espera); `later` e `tween` ganharam tipo
  (cosmético, com nome, ou trabalho em andamento); `saveState`/`loadState` para a fuga, o grupo do Relicário e os
  timers com nome.
- `dialogue.js`: o nó atual, e reabrir uma conversa. `combat.js`: quando a luta está estável, e retomá-la.

Diferenças em relação ao plano:

- **Sem gerador com semente**, pela decisão 1.
- **Sem checkpoint de cena**, pela decisão 2: salvar numa cena é recusado, e um save automático é feito quando a cena
  termina (no máximo um por minuto).
- **Mapas construídos a partir da história** (Vau-de-Cardo e a Travessia dependem das flags do prólogo): cada mapa
  guarda as flags com que foi construído, e o carregamento o reconstrói com elas.
- **"Tentar a luta de novo"** só existe na sessão em que a luta começou. Depois de carregar dentro de uma luta, a
  tela de derrota oferece **Carregar o último save** (há sempre um automático do primeiro turno da luta).

Testado (Chrome sem janela, roteiros em Playwright): salvar e carregar explorando no acampamento, no sonho e em
Vau-de-Cardo (o estado depois de carregar é igual ao salvo, fora o relógio e o passo que os seguidores dão no
primeiro quadro); no meio de uma conversa (volta no mesmo nó); em combate (volta no mesmo turno, com os mesmos PV,
e a luta continua); o save automático no primeiro turno da luta; o bloqueio durante uma cena; a cópia principal
adulterada (carrega a anterior e avisa); as duas cópias estragadas (recusa e o jogo segue); Continuar no menu.

Falta, ou não foi testado:

- Salvar durante a **fuga da Bruma** e no **Relicário** em luta (com aliados chegando no meio) não foram testados
  de ponta a ponta, só pelas partes.
- **Exportar e importar** não foram testados num navegador de verdade (o download não roda no navegador sem janela).
- O teste que procura estado de módulo fora do registro (seção 9, item 5) não foi escrito.
- Um save de uma versão mais nova do jogo é recusado; ainda não há nenhuma migração escrita (o formato é o 1).

### 12.1 Capítulo 2 (versão 0.9.0)

- **Conteúdo novo, mapas novos.** O capítulo 2 vive em três mapas próprios (`bosque`, `mosteiro`, `claustro`, em
  `src/maps2.js`). Os mapas da 0.8.0 não ganharam nem perderam nada nas listas de objetos, baús, NPCs e inimigos: o que
  liga a Travessia ao Mosteiro é um gatilho de posição e um item clicável calculado (`interactables()`), que não têm
  id. `maps1.js` e `maps.js` só passaram a exportar `openWorld` e `gridWorld`.
- **Flags novas** começam indefinidas (`c2`, `c2_*`, `hulda_*`, `pipa*`, `ch2_done`...); nenhuma flag antiga mudou de
  sentido. O formato continua 1, sem migração. `schema.js` aceita os mapas novos.
- **Testes versionados** em `tests/` (`npm test`, Playwright): os saves de referência da 0.8.0 (`tests/saves/0.8.0/`,
  feitos por `make-saves.mjs` com o código da 0.8.0) carregam com o mesmo estado e seguem jogáveis; os ids dos mapas
  antigos são comparados, objeto por objeto, entre o código da 0.8.0 (tirado do git) e o atual; a atualização
  automática é testada com o service worker de verdade (save automático feito pelo código velho, carregado pelo novo);
  o capítulo 2 é jogado de ponta a ponta com saves novos explorando, em conversa e em combate.
- Agora exportar e importar foram testados num navegador (o download e o seletor de arquivo pelo Playwright).

