# Mapa da história jogável

Cada **passo obrigatório** do prólogo, do capítulo 1 e do capítulo 2 do Ato I: a flag que ele liga, de quais depende,
e todos os caminhos para cumpri-lo. Um passo está **garantido** quando há pelo menos um caminho sem rolagem, que não
depende da ordem nem de escolhas anteriores (ou quando todos os ramos de uma rolagem levam adiante). Serve para achar
becos sem saída: um passo com um caminho só, e esse caminho com rolagem, item que some ou NPC que pode ir embora, é
um beco.

Legenda: **G** garantido; ⚂ rolagem; 💰 custa ouro; ⚔ luta (perder recomeça a luta, não trava).

## Prólogo (`src/story.js`)

| Passo | Liga | Depende de | Caminhos |
|---|---|---|---|
| Sonho | `dream_done` | — | **G** andar até a mulher da lanterna (dispara sozinho em `ty ≤ 5`); `Tocar a luz.` sempre está lá |
| Acampamento | `awake` | `dream_done` | **G** a conversa com Kael ou Lyra (os testes da conversa só mudam a fala) |
| Ruínas | `ruins_entered` | `awake` | **G** andar para o norte |
| Clã goblin | `clan` | `ruins_entered` | **G** brecha (⚂ Furtividade: passou = `infiltrated`; falhou = Gorza) ou entrada da frente (Gorza). Com Gorza: ⚂ Persuasão / Intimidação, ou ⚔. Todo ramo liga `clan` (`truce`, `scared`, `fight`, `infiltrated`) |
| **Porta sob as ruínas** | `trapdoor_open` | `ruins_entered` | **G** Tomé: `Mostre essa porta.` (na primeira conversa). **G** Tomé mandado para casa: no cais ele diz onde fica (`tome_told`) e a **coluna partida** abre sem rolagem. **G** coluna depois de conhecer o Tomé (`tome_met`). ⚂ coluna sem saber (Investigação/Percepção CD 12, uma vez; falhou = `column_try: false`, e o Tomé continua nas ruínas para mostrar) |
| Relicário | `relic_entered` | `trapdoor_open` | **G** descer pelo alçapão |
| Três Lumes | `door_open` | `relic_entered` | **G** responder às três estátuas (não há rolagem) |
| Coração | `heart_seen`, `arq_talk` | `door_open` | **G** andar até a Arquivista |
| **Eco** | `echo` | `arq_talk` | **G** no 4º turno da luta com Cendra ou quando alguém cai. **G** se a luta acabar antes disso, o Eco vem logo depois dela (antes não vinha: beco). Aceitar ou recusar, os dois entram |
| Fuga | `relic_collapse`, `escape` | luta com Cendra vencida ⚔ | **G** escada (`Escada (fugir!)`) |
| Barco | `escape_done` | `escape` | **G** chegar ao cais (a Bruma alcança e devolve à trilha, nunca mata) |
| Ato I | `act1` | `escape_done` | **G** botão `Continuar: Ato I` da tela final |

Paralelos (opcionais): Maren e a cadeira (`maren_quest`, `returned_heirloom`), a patrulha (`patrol`), o pacto
(`goblin_pact`, ⚂ uma vez, falhou = `pact_refused`), a corça, o píer, a árvore dos nomes, o marco, Otávio (⚂ uma
vez, ou **G** com `names_tree`).

## Ato I, capítulo 1 (`src/act1.js`)

| Passo | Liga | Depende de | Caminhos |
|---|---|---|---|
| Taverna | `rosalva_met` | `act1` | **G** falar com Rosalva |
| **Recado de L.** | `note` | `rosalva_met` | **G** mostrar a Carta do Contrato (se ainda existe: queimá-la na fogueira goblin é escolha do prólogo). **G** `Abrir a mão no balcão e mostrar a marca.` (`rosalva_mark`). **G** pedir a ela, depois de descobrir que é Lembradora. ⚂ Persuasão ou Enganação, **uma** das duas, uma vez (`rosalva_ask`). Antes, as rolagens se repetiam até passar, e sem a carta eram o único caminho |
| Descanso | `rested1`, `eco_trade` | — | **G** fogueira da praça de noite (de graça); quarto do celeiro (💰 5) ou dos fundos (se Lembradora) |
| Portão | `gate_passed`, `trav_entered` | `note`, `rested1`, dia | **G** luvas; 💰 20; ⚂ Enganação/Intimidação: os dois ramos passam (falhar liga `guard_alert`) |
| Procissão | `proc` | `trav_entered` | **G** deixar passar, ⚔ atacar, a fumaça (se tem). ⚂ Persuasão uma vez (`proc_free_try`) |
| Murta | `toll` / `murta` / pacto | conforme o vale | **G** todos os ramos passam (pagar, ⚂, passar, ⚔) |
| Caçadores | `hunters` | chegar ao leste | **G** todo ramo termina: ⚂ que falha vira ⚔ |
| **Mensageira** | `ch1_done` | `hunters` ≠ `met` | **G** falar com Odara (uma pergunta, a rolagem só muda a resposta) |

Paralelos: o cartaz (`poster_seen`), o tributo de Iara (⚂ resolvidas uma vez; falhou = pagar ou deixar), o cofre de
Nix (cada jeito de passar pelo sargento uma vez: `box_sneak`, `box_lie`; 💰 25 sempre; o cadeado ⚂ uma vez,
`box_lock`, e depois Nix abre), o santuário, a bolsa da mensageira, Tomé na fogueira.

## Ato I, capítulo 2 (`src/act1ch2.js`)

| Passo | Liga | Depende de | Caminhos |
|---|---|---|---|
| Bosque | `c2` | `ch1_done` | **G** tela de fim do capítulo 1 ou fim da estrada da Travessia |
| Mosteiro | `c2_arrived` | `c2` | **G** andar até o leste do bosque (as mariposas não bloqueiam: estão fora da trilha) |
| A Madre | `c2_madre_met`, `c2_madre` | `c2_arrived` | **G** dispara ao chegar perto; todo ramo termina |
| **Porta atrás do véu** | `c2_altar` | `c2_arrived` | **G** Irmão Tadeu + o sinete (Odara sempre dá o sinete). **G** Irmão Silas (se `silas_doubt`). ⚂ procurar sozinho, uma vez (`c2_altar_try`); falhou, o texto aponta para "alguém da casa" |
| Guardas | `c2_guards` | `c2_altar` | **G** todo ramo termina (⚂ que falha vira ⚔) |
| **Chave / cela** | `hulda_free` | `c2_guards` | **G** a chave: dormindo, permissão da Madre, luta vencida, ou **no prego ao lado da porta** quando os guardas saem (`silas`) ou voltam às xícaras (`talk`); antes, nesses dois ramos não havia chave. **G** Nix. ⚂ arame e ⚂ força, uma vez cada (`c2_bars_pick`, `c2_bars_force`) |
| Hulda | `hulda_joined` | `hulda_free` | **G** acordar (todo ramo acorda) |
| **Escolha** | `c2_choice` | `hulda_joined` | **G** no portão: Coroa, ataque ⚔, ou paz |
| Fim | `ch2_done` | `c2_choice` | **G** a manhã seguinte |

Paralelos: L. (`c2_sabia`, não é exigido pela escolha; depois da escolha some do diário), o livro de nomes, o chá de
Clara (⚂ uma vez), a chaleira (⚂ uma vez, `c2_kettle_try`), Pipa (⚂ uma vez, `pipa_ask`; levá-la ao pai antes da
escolha faz o reencontro na hora, `pipa: "home"`, e a manhã seguinte não o repete), dormir no Mosteiro (uma vez:
na segunda o companheiro não deixa).

## Becos corrigidos nesta revisão

| Beco | Save que ficou preso | Como solta ao carregar |
|---|---|---|
| Tomé mandado para casa antes de mostrar a porta: ninguém mais abria a laje | `tests/becos/tome-em-casa-sem-porta` (0.9.0) | `repair()` em `src/story.js` liga `tome_told`: a coluna abre sem rolagem, e o Tomé repete no cais |
| Luta do Relicário vencida antes do 4º turno sem ninguém cair: o Eco nunca entrava (a marca, o Lampejo e o Ato I contavam com ele) | `tests/becos/relicario-sem-eco` (0.9.0) | `repair()` agenda a cena do Eco um segundo depois de carregar; num save já no Ato I, `echo` vira `refused` ("ela entrou mesmo assim") |
| Recado de L. sem a carta: só rolagens (repetíveis); com a regra nova de rolar uma vez, seria beco | — | caminho garantido novo (mostrar a marca); não há save preso, porque antes dava para repetir |
| Cela de Hulda sem chave nos ramos `silas`/`talk` dos guardas: só rolagens (repetíveis) | — | a chave no prego, que também aparece para saves feitos antes |

`tests/becos.test.mjs` carrega cada save preso e joga até sair do beco. `tests/story.test.mjs` joga cada parte até o
fim nas ordens "erradas", falhando todas as rolagens, pulando o opcional e fazendo o opcional antes.
