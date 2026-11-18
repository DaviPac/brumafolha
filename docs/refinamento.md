# Refinamento (0.10.0): diagnóstico e o que foi feito

Rodada de melhoria do que já funciona, do prelúdio ao fim do capítulo 2 do Ato I. Sem história nova.

## Como foi jogado

- **Partida 1**: guerreiro humano com **Lyra**, prólogo inteiro com todas as rolagens falhando (luta com a patrulha, luta
  nas ruínas, Relicário). **Partida 2**: mago elfo com **Kael**, capítulo 1 (Nix, Rosalva, a primeira troca com o Eco,
  a Travessia, os caçadores) e capítulo 2 até o Mosteiro, com as rolagens passando.
- Roteiro automático em `tests/tour.mjs` (`node tour.mjs antes|depois`), com fotos em `tests/out/tour/`. As duas
  partidas também foram lidas no código, cena por cena, e os seis testes de `tests/` deram a linha de base.
- Comparação: Baldur's Gate 3 (aprovação, subida de nível, leitura do combate), Divinity: Original Sin 2 (companheiros
  que comentam o mundo, conversas entre eles), Disco Elysium (testes que dizem do que dependem, o mundo que reage) e
  Sea of Stars (ritmo: combate rápido, fogueira como momento, andar sem cansar).

Legenda do estado (preenchida no fim da rodada): **feito**, **parcial**, **não feito**, com o motivo.

## Diagnóstico, em ordem de impacto para o jogador

### 1. Subir de nível não é uma escolha
- **Onde**: `G.hooks.gainXp` (`src/main.js`). Ao subir, aparece um aviso "alcançou o nível 2!" e os números mudam por
  baixo. O jogador chega ao nível 3 no capítulo 1 e ao 4 no fim do capítulo 2 sem decidir nada.
- **Por que incomoda**: é o momento de recompensa mais esperado de um RPG, e passa em um segundo. No BG3 e no DOS2
  cada nível é uma tela com escolhas; aqui é um número.
- **Proposta**: tela de subida de nível no padrão do criador: o que ganhou (PV, ataque, espaços), e uma escolha
  obrigatória entre uma **habilidade ou magia nova da classe**, **+1 num atributo** ou **uma perícia nova**.
  Companheiros sobem com uma sugestão que dá para trocar. Saves antigos com nível alto recebem as escolhas pendentes,
  já com sugestão.

### 2. Os companheiros só falam quando o roteiro manda, e a aprovação não muda nada
- **Onde**: `approve()` (`src/story.js`) soma um número e escreve "Kael aprova" sobre a cabeça dele, uma vez por
  escolha. Só conta para o companheiro de origem (Kael ou Lyra); Nix e Hulda nunca aprovam nem desaprovam. Fora das
  cenas, ninguém do grupo diz nada: entrar em Vau-de-Cardo, passar pelo cartaz com a cara do herói, ver o jardim do chá
  de bruma, nada.
- **Por que incomoda**: os companheiros são a alma desse tipo de jogo (§4 da bíblia), e aqui eles somem entre as cenas.
  A aprovação é invisível na prática (o aviso aparece no meio de uma cena e some) e não tem efeito, então as escolhas
  morais parecem não pesar.
- **Proposta**:
  - aprovação para quem estiver no grupo (Kael, Lyra, Nix, Hulda), com aviso discreto no canto (retrato e "gostou" /
    "não gostou"), sem número, e o estado da relação em palavras no Diário (aba **Grupo**);
  - aprovação alta: o companheiro **ajuda nos testes** (+1, dito na opção) e abre a **conversa pessoal** na fogueira;
    baixa: fala mais seca e não ajuda; muito baixa: ele **confronta o herói** uma vez, e deixa de ajudar em qualquer
    teste até a relação melhorar (ir embora mudaria o roteiro, que não muda nesta rodada);
  - as trocas com o Eco pesam como a bíblia pede: Kael desaprova, Nix acha fascinante, Hulda desaprova, Lyra se
    incomoda;
  - **falas espontâneas**: comentários curtos ao entrar em lugares, perto de objetos marcantes e depois de escolhas
    grandes, e **conversas entre companheiros** enquanto o grupo anda, cada um com a própria voz; nunca em combate,
    conversa ou cena, e cada uma uma vez.

### 3. O combate se lê mal e anda devagar
- **Onde**: `src/combat.js`.
  - Com um mago, clicar num inimigo escolhe **Ataque corpo a corpo** e anda até ele (foto `antes-03`: Lyra, 45%, "vai
    até ele"). O certo é o truque da classe.
  - Por que um ataque errou só aparece no registro (canto direito); na cena, só "Errou".
  - A faixa de iniciativa não diz quem age a seguir; *Esquecido*, *Enredado*, *Zombado*, *Marcado* e *Inspirado* são
    só um texto que sobe e some: não há como saber, depois, quem está com o quê.
  - Não há como acelerar: cada turno inimigo tem esperas fixas.
  - A IA ataca sempre o mais perto. Ninguém foca o ferido, ninguém recua ferido, ninguém protege o chefe (Gorza, Hesta,
    Sálvia).
- **Por que incomoda**: lutas repetem o mesmo padrão, e o jogador não entende o que aconteceu. No BG3 a chance, o
  motivo do erro e as condições estão sempre à vista.
- **Proposta**: ação padrão pela classe; texto do erro com a conta ("Errou: 9 contra CA 13"); marca de "a seguir" na
  iniciativa; ícones de condição sobre a unidade e no retrato, com dica explicando; opção **Combate rápido** (e segurar
  `Shift` acelera); IA que foca quem está ferido ou mal protegido, recua quando está quase morta (goblins, caçadores) e
  manda os guarda-costas para perto do chefe.

### 4. Descansar não é um momento
- **Onde**: `rest()` (`src/main.js`). Fora das três noites com cena (o primeiro descanso do prólogo, a noite do Eco em
  Vau-de-Cardo e a clareira do capítulo 2), descansar é um aviso e um som.
- **Por que incomoda**: a bíblia (§8) faz da **fogueira de histórias** uma mecânica central: companheiros contam
  lembranças, o herói ancora as dele. Hoje ela só existe como roteiro, uma vez.
- **Proposta**: depois de descansar, a fogueira: o jogador escolhe com quem conversar (ou só dormir). Cada companheiro
  tem histórias em sequência, as melhores pedindo aprovação; ouvir uma vira lembrança no Diário e **ancora** uma
  lembrança do herói. Lembrança ancorada não é a que o chá do Mosteiro leva.

### 5. Explorar quase não rende nada
- **Onde**: `src/items.js` e os baús dos mapas. Fora do prólogo, os baús dão poção e ouro; não há item com efeito que
  mude o jogo, e nenhum item conta a noite do ritual (§8, "lore à Dark Souls").
- **Proposta**: **Relíquias de Velmoor**: objetos legíveis espalhados pelos lugares já existentes (baús e achados novos
  acrescentados só no fim das listas), cada um com um pedaço da noite do ritual e um efeito pequeno enquanto está na
  bolsa. O Diário junta os pedaços. Ícones novos no atlas.

### 6. Não saber para onde ir
- **Onde**: o rastreador de missões existe (canto superior direito), mas o mapa não mostra nada. Em Vau-de-Cardo e na
  Travessia o jogador lê "Procure L. na taverna" e procura a taverna.
- **Proposta**: uma marca discreta no chão do próximo objetivo (e uma seta na borda da tela quando está longe), que
  pode ser desligada nas opções.

### 7. Andar cansa
- **Onde**: mapas de 40 a 50 casas, andando a 88 px/s; a Travessia vai e volta para a cena dos caçadores.
- **Proposta**: **correr** (segurar `Shift`, ou o B do controle), e clicar duas vezes para correr até o ponto. Viagem
  rápida entre os mapas já visitados foi considerada e deixada de fora (ver o fim).

### 8. Vau-de-Cardo parece vazia
- **Onde**: foto `antes-11`: o mercado dos refugiados à noite e de dia tem barracas e ninguém. Os moradores estão
  parados nos seus pontos e não reagem ao que o grupo fez (o cartaz, Rosalva, a guarnição).
- **Proposta**: moradores que andam entre pontos, conversas de fundo que se ouvem ao passar (balões curtos) e que mudam
  com o que aconteceu. Novos moradores só no fim da lista de NPCs do mapa.

### 9. Os testes de perícia não dizem de que dependem
- **Onde**: a opção mostra "Persuasão CD 14 · Aldren +2 · 45%". Não diz que Persuasão é Carisma, nem que outro do grupo
  ajudaria.
- **Proposta**: "Persuasão (CAR)", e a ajuda de um companheiro que gosta do herói aparece na conta ("+1 Kael").

### 10. Texto demais de uma vez
- **Onde**: seis blocos de quatro falas seguidas (`story.js` 710, 1063, 1104; `act1ch2.js` 375, 771, 945), alguns
  seguidos de mais falas soltas.
- **Proposta**: dividir com uma escolha curta do jogador no meio, ou juntar falas pequenas.

### 11. Detalhes visuais
- O **registro do combate** continua na tela depois da luta, explorando (fotos `antes-07`, `antes-08`).
- O **nome do lugar** aparece por cima das barras de cinema numa conversa (foto `antes-02`).
- O **Relicário com a luz ligada** fica estourado: o chão branco-azulado sem sombra (foto `antes-07`). O sonho não foi
  revisado na 0.9.
- O d20 e as conversas não dizem o atalho para acelerar o texto.

### 12. Tutorial
- **Onde**: `src/tutorial.js`. As dicas aparecem uma vez cada e na hora certa (combate, turno, testes). A dica de
  descanso fala só da fogueira do acampamento; não há dica para correr, para a fogueira de histórias nem para subir de
  nível (que agora existem).
- **Proposta**: três dicas novas, na hora em que cada coisa acontece pela primeira vez.

## O que ficou de fora de propósito
- **Interiores de Vau-de-Cardo**: seriam mapas novos (taverna, guarnição). Ficou para outra rodada; o esforço foi para
  a cidade de fora estar viva.
- **Viagem rápida**: os quatro mapas do Ato I já são vizinhos e a história dispara cenas pelas bordas (o portão de
  manhã, a saída para o Mosteiro); pular entre eles quebraria esses gatilhos. Correr resolve a maior parte.
- **Um companheiro ir embora** com aprovação muito baixa: mudaria o roteiro (a história conta com Kael ou Lyra em quase
  todas as cenas).
