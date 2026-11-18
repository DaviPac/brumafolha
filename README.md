# Brumafolha

RPG tático top-down em pixel art: exploração, diálogos com testes de d20 e combate por turnos
(iniciativa, movimento em grade, ação + ação bônus, CA, magias com espaços), no navegador, sem build.

Toda a arte é gerada por código no carregamento (`src/art/`): cenário, personagens, ícones, molduras da
interface e até a fonte. Os efeitos de combate (fogo, mísseis, golpes, cura) vêm do
[pixelfx](https://github.com/patch-gg/pixelfx) (MIT), copiado em `vendor/pixelfx`. Não há nenhum arquivo de
imagem, som ou fonte (nem os ícones do app, desenhados pelo service worker), e nada é baixado da rede.

## Rodar

```bash
python3 tools/serve.py
```

Abra http://localhost:5173. A folha de assets fica em http://localhost:5173/tools/sheet.html
(`?only=icons` mostra só o atlas de ícones).

Atalhos de desenvolvimento: `?dev=camp` pula título, criador e sonho; `?dev=ato1&f=goblin_pact,maren_aboard,maren_lucid,tome_alive`
começa no Ato I como se o prólogo tivesse terminado com essas flags (`&cls=mago`, `&race=elfo` escolhem o herói; `&u=2` força a escala da interface).

## App (PWA) e celular

O jogo é um PWA: instalável (botão **Instalar o jogo** no menu inicial no Chrome/Edge; no iPhone/iPad o botão explica
o *Compartilhar → Adicionar à Tela de Início* do Safari), abre em tela cheia e joga **sem internet**.

- `manifest.webmanifest`: nome, cores, tela cheia, ícones.
- `sw.js` (service worker): cada arquivo vem da rede primeiro (uma atualização aparece no próximo carregamento) e
  fica num cache; sem rede, serve o cache. Depois do primeiro carregamento a página manda ao SW a lista de tudo o que
  carregou, então o jogo inteiro já fica offline na primeira visita. Cada versão tem seu cache (`brumafolha-<versão>`), e a nova baixa de novo tudo o que a anterior guardava.
- Os **ícones** (`icons/*.png`) não são arquivos: o service worker os desenha por código (`src/art/appicon.js`, a
  mesma folha da abertura) e os guarda no cache. Instalar exige HTTPS (ou `localhost`).
- **Atualizações automáticas**: a versão e as notas de cada uma ficam em `src/version.js`. Para publicar uma
  atualização, suba `VERSION` e ponha uma entrada nova no topo de `NOTES`. O service worker importa esse arquivo, então
  o navegador instala a versão nova em segundo plano (confere ao abrir, a cada meia hora e ao voltar para o jogo), e o
  jogo passa para ela sozinho num momento seguro (`src/update.js`): no menu inicial, na hora; numa partida, explorando
  sem nada aberto, depois de um save automático que o recarregamento carrega de novo, então o jogador continua do
  mesmo ponto. Combate, conversa e cena esperam. Depois, a janela **Novidades** mostra o que mudou (ela também fica no
  menu inicial e nas opções). Os saves guardam a versão que os gravou.
- No celular há controles por toque (tocar, segurar e arrastar; no combate, um toque mostra e o segundo confirma) e
  a interface se arruma em retrato e em paisagem.

## Carregamento

Do primeiro instante até o jogo estar pronto, uma tela de carregamento com um **d20 rolando**: um icosaedro de
verdade girado em 3D e desenhado pixel a pixel no prata do d20 dos testes, com números aparecendo na face da frente,
uma frase para cada etapa ("Pintando o vale pixel a pixel...", "Sonhando com Velmoor...") e uma barra de progresso.
Ela é um script comum que roda antes do código do jogo ([src/loading.js](src/loading.js)), então não há tela preta
no começo, e o dado gira só com CSS de deslocamento, que continua liso mesmo com o navegador ocupado.

- **Pintar o chão do vale** era quase todo o carregamento (cerca de 4 milhões de pixels com ruído). Agora ele é
  pintado em faixas, em paralelo, em *Web Workers* (um por núcleo), e sai idêntico pixel a pixel ao de antes.
- **Da segunda visita em diante**, o chão pronto é guardado no navegador e só desembrulhado. A chave é uma soma do
  próprio código que pinta o chão: se ele mudar, a imagem guardada é ignorada e refeita.
- Medido num navegador sem janela e lento (4 núcleos): de 12,5 s para 7 s na primeira visita e 1,5 s nas seguintes.
- **Carregar um save** usa a mesma tela: ela entra na hora, o save é conferido por baixo, a página recarrega atrás
  dela e ela sai quando o jogo está de volta. "Novo jogo" escurece o menu antes do prelúdio, em vez de cortar.

## Tela de início

Antes do menu, uma noite no vale feita só com efeitos do [pixelfx](https://github.com/patch-gg/pixelfx): aurora,
estrelas cadentes, a Bruma baixa e vaga-lumes sobre o capim. Ela aparece enquanto o vale é pintado e, quando o jogo
está pronto, pede **Clique para iniciar** (ou qualquer tecla, um toque, o A do controle). Ela existe porque o
navegador não deixa tocar nenhum som antes de um clique: assim a música do menu e a abertura começam juntas.
Código em [src/press.js](src/press.js).

## Menu inicial

O jogo abre num menu com o vale vivo ao fundo: a câmera passeia devagar sobre o Lago Espelhado ao entardecer.
Opções: **Novo jogo**, **Continuar** (o save mais recente), **Carregar jogo**, **Opções** (o mesmo painel do menu de
pausa) e **Créditos**.

Na **primeira vez** que o jogo é aberto, há uma abertura: uma folha cai no escuro, girando e mostrando ora o verde,
ora o lado prateado de baixo (de onde vem o nome do vale), pousa onde fica o nome, e "Brumafolha" surge letra por
letra. Nas próximas vezes, uma versão curta. Qualquer tecla ou clique pula. A abertura é feita com animações CSS e não
com timers, porque toca enquanto o vale é pintado, e esse trabalho ocupa o navegador por um ou dois segundos.
Código em [src/title.js](src/title.js).

## Salvamento

Salva-se explorando, no meio de uma conversa com um NPC e em combate (no turno de um personagem do grupo). Não se
salva durante cenas. Se você pede no meio de uma ação (um ataque, o turno de um inimigo, um d20 rolando), o jogo
salva assim que ela termina.

- **Menu de pausa** (`Esc`): **Salvar** (novo save ou por cima de um antigo) e **Carregar**. **F5** faz um save
  rápido, **F9** carrega o save rápido.
- **Automáticos**: no primeiro turno de cada luta, ao fim de uma cena (no máximo um por minuto) e a cada 10 minutos
  explorando. Ficam os 3 últimos de cada partida.
- Os saves se agrupam por partida (um herói). Cada um mostra uma miniatura da tela, o lugar, a missão e o tempo de jogo.
  Dá para **exportar** um save como arquivo e **importar** de volta, a única proteção contra o navegador limpar os
  dados do site.
- Por dentro: cada save tem uma soma SHA-256 e a cópia anterior; um save danificado carrega a cópia e avisa.
  Carregar recarrega a página e reconstrói o jogo do zero a partir do save, então nada do jogo anterior vaza para o
  carregado. Detalhes, decisões e o que falta em [docs/salvamento.md](docs/salvamento.md).

## O Prelúdio

Ao clicar em **Começar**, o jogo não vai direto para o criador: uma cena de abertura, narrada pela **Lyra**, passeia
com a câmera pelo vale de verdade antes de o herói existir.

1. **No escuro**, a inscrição de Velmoor: "Tudo o que existe é lembrado por alguém. O que ninguém lembra, a Bruma leva."
2. **As Ruínas de Velmoor, de noite**: o Sonhador, Ondrael, e a cidade de torres brancas que ninguém lembra.
3. **A Bruma desce do norte** e cobre as ruínas enquanto a câmera recua: o que ela faz com lugares e pessoas.
4. **O Lago Espelhado ao amanhecer**: uma elfa anda até a ponta do píer e se apresenta. Lyra fala do vale, do contrato
   assinado "L." e do sonho da mulher de cabelos de prata, e termina perguntando: **"Quem é você?"**. Daí abre o criador.

As falas aparecem como legendas, com barras de cinema. `Clique`, `Enter` ou A avançam; `Esc` ou B pulam o prelúdio
inteiro. A narração não revela os segredos da Lyra (a Poda, Aurelith): só deixa a ponta. Código em [src/intro.js](src/intro.js).

## O Prólogo: "A Bruma de Brumafolha"

O jogo agora conta o prólogo inteiro da [bíblia da história](docs/historia.md) (§6), seguindo a [planta](docs/planta-prologo.html):

1. **O sonho**: uma Velmoor de torres brancas e gente sem rosto; a mulher da lanterna pede "lembre-se de mim".
2. **O acampamento**: a conversa de abertura com o companheiro, a Carta do Contrato no baú, a corça esvaída e a primeira história na fogueira (que faz a névoa recuar).
3. **A patrulha**: escutar escondido, intimidar, conversar com o Fiapo ou lutar. A pilha de saque guarda a rede e a cadeira de Otávio.
4. **O Lago Espelhado**: Maren e a missão das redes, o reflexo na ponta do píer, a Árvore dos Nomes e o marco de Velmoor.
5. **As ruínas**: o clã Dente-de-Musgo. Negociar (e fechar um pacto com Maren), ameaçar, entrar escondido pela brecha leste, lutar ou atacar a Avó Fuligem primeiro.
6. **O Relicário** (mapa novo): o átrio dos rostos, as três estátuas que definem a origem do herói, a Arquivista, a Irmã Cendra e o Eco.
7. **A Bruma sobe**: fuga até o cais com a névoa no encalço, e o barco que atravessa o Lago Espelhado e desce o **Rio Cardo** rumo a Vau-de-Cardo.

A água reflete o que está nas margens (árvores, cais, o barco, o grupo), com ondulação.

As escolhas ficam em flags (`G.f`) e mudam o caminho: quem ajuda na luta final, como a Bruma avança, se Maren lembra de vocês. No fim, uma tela resume o que o vale vai lembrar.

**Tutorial opcional**: ao começar, o jogo pergunta se você quer dicas. Elas aparecem uma vez cada, sem pausar o jogo, e podem ser desligadas no menu.

**Diário** (`J`) e **Bolsa** (`I`): missões com notas, itens legíveis (a carta) e o Diário de Lembranças.

Se o grupo cair numa luta, dá para tentar a mesma luta de novo.

Código: o roteiro está em [src/story.js](src/story.js), os mapas novos em [src/maps.js](src/maps.js) e [src/art/interiors.js](src/art/interiors.js), as dicas em [src/tutorial.js](src/tutorial.js) e o Diário em [src/journal.js](src/journal.js).

## Ato I, capítulo 1: "A Marca de Cardo"

No fim do prólogo, **Continuar: Ato I** leva o barco a **Vau-de-Cardo** (bíblia §7), de noite.

- **Vau-de-Cardo** (mapa de cidade): cais, paliçada, a taverna do Sabiá Cego, o mercado dos refugiados, a
  guarnição da Coroa, o acampamento dos refugiados. **Travessia do Cardo** (área externa): a estrada, o santuário
  de Nhara, o vau, a margem leste, e a Bruma na borda norte.
- **Missão principal, "O Sabiá Cego"**: "L." não está na taverna. Rosalva guarda um recado; há um cartaz da
  Coroa por um "portador de marca prateada"; o portão só abre de manhã e pede as mãos à mostra; do outro lado
  do vau, caçadores da Coroa prenderam a mensageira de L.
- **Secundárias**: *O tributo de Iara* (um Coletor cobra uma lembrança de uma refugiada; Kael conhece o
  Coletor) e *A Lume do comandante* (o roubo que Nix "Pena-Rubra" propõe; no fim ela entra no grupo).
- **A primeira troca com o Eco**: na primeira noite dormida a Arquivista oferece um poder em troca de uma
  lembrança do Diário, que fica riscada. Quem aceitou o Eco no Relicário recebe os *Olhos de Velmoor*; quem
  recusou recebe agora o *Lampejo*, já com custo (§6.6).
- **Dois combates novos**: a procissão perdida (Irmã Dalva e três Esvaídos) e os caçadores da Coroa (Capitã
  Hesta, soldados e um besteiro). Os dois têm saída sem luta. Quem matou a Avó Fuligem tem um terceiro: a
  emboscada de Murta no vau.
- **O que vem do prólogo (§6.10)**: nível 2, o Eco e o Lampejo, o ouro de Maren ou a cadeira de Otávio.
  `goblin_pact`: o clã guarda o vau e atravessa para lutar ao seu lado. Avó morta: Murta embosca. Clã expulso
  por intimidação: Murta cobra pedágio, e pode amolecer. `silas_doubt`: Silas anda atrás da procissão e não
  luta. `otavio_found`: a pista do registro do Mosteiro, e a conversa com Maren. `maren_forgot`: Maren na
  fogueira sem saber quem é; a cadeira pode ser posta ao lado dela; Tomé pergunta se a Arquivista devolve a avó.

### Decisões onde o roteiro era ambíguo

A bíblia descreve o Ato I por áreas, sem ordem de cenas. O que foi decidido aqui:

1. **Por que "L." não aparece.** A bíblia só diz que ele "não aparece na taverna" e que se revela no fim do ato.
   Aqui ele foi "convidado a descansar" pela Ordem e está no Mosteiro do Véu Sereno. Isso liga a missão
   principal à próxima área (Hulda, a Madre) e guarda a revelação para lá. A mensageira o chama de "Sabiá",
   sem dizer mais.
2. **Ordem das áreas.** Este capítulo cobre Vau-de-Cardo e a Travessia. Mosteiro, Lethiel e a Procissão Branca
   ficam para depois.
3. **Nix entra no grupo em Vau-de-Cardo** (a bíblia permite Ato I ou II). O cofre guarda uma Lume comum,
   tomada de uma refugiada: assim o roubo tem dono e a escolha (Nix, a dona, ou você) pesa.
4. **Murta não entra no grupo ainda.** A bíblia diz que ela "se junta na Travessia (ou ataca o grupo)". Com o
   pacto ela luta ao seu lado e promete ir quando vocês voltarem à Bruma; fica como promessa (`murta_promise`).
5. **Silas** aparece só com `silas_doubt`, e só marca o encontro no Mosteiro ("pela porta da cozinha").
6. **Hora do dia**: chegada de noite, portão fechado até amanhecer. Isso força o primeiro descanso, que é quando
   o Eco faz a oferta.
7. **Fumaça de lembrança** (§8): aqui é um item de uso único que tira a condição *Esquecido* de uma luta e,
   diante dos Esvaídos, os faz hesitar.

Código: [src/act1.js](src/act1.js) (roteiro), [src/maps1.js](src/maps1.js) (mapas), [src/art/town.js](src/art/town.js) (chão e props da vila).

## Ato I, capítulo 2: "O Véu Sereno"

Quem terminou o capítulo 1 segue pela tela de fim (**Seguir para o Mosteiro**) ou pelo fim da estrada da Travessia, a
leste. `?dev=ato1c2&f=...` começa direto no capítulo 2. Três mapas novos ([src/maps2.js](src/maps2.js)): o **Sul do
Bosque** (Abel e o passarinho de Pipa, as mariposas da Bruma e a peregrina, a clareira para dormir), o **Mosteiro**
(pátio, jardim do chá de bruma, hospedaria, portão norte) e o **claustro** (cozinha, dormitório dos órfãos, capela e a
Ala do Silêncio atrás do véu do altar). Roteiro em [src/act1ch2.js](src/act1ch2.js), arte em
[src/art/abbey.js](src/art/abbey.js) e [src/art/creatures.js](src/art/creatures.js).

- **Madre Odília**: conversa longa em três rodadas de testes; pode hesitar (e liberar Hulda), empatar ou quase convencer.
- **Hulda Ferrobarba** entra no grupo (clériga anã, Martelo de Ormun). **O Velho Sabiá** está lá, mas a revelação fica
  para a Procissão Branca. **Silas** espera na porta da cozinha se `silas_doubt`.
- **Escolha do Mosteiro**: denunciar à Coroa, atacar, ou levar só Hulda; o custo aparece na manhã seguinte.
- Usa o que veio antes: `otavio_found` (o livro de nomes, um argumento contra a Madre), o sinete (Irmão Tadeu pergunta
  pela Página em Branco), a lembrança dada ao Eco (a Madre pede justamente uma lembrança de origem), a aprovação do
  companheiro (alta: ele responde por você; baixa: ele concorda com a Madre e o teste fica mais difícil), Nix (chaleira,
  fechadura, o livro), dormir no Mosteiro (uma lembrança riscada "pelo chá", e a Madre vê a sua mão).
- Combates novos: as mariposas (Esquecido) e a Irmã Sálvia com os irmãos do Véu; os dois têm saída sem luta. Atacar o
  Mosteiro abre um terceiro.

### Decisões (capítulo 2)

1. L. não sai do Mosteiro: precisa saber a data da procissão; promete contar tudo lá (a revelação fica para o clímax).
2. Silas não entra no grupo ainda (`silas_promise`): estará na procissão.
3. Dormir no Mosteiro não é proibido: risca uma lembrança não-de-origem (marcada `by: "cha"`) e a Madre vê a marca.
4. "Denunciar à Coroa" é mandar o registro à guarnição de Vau-de-Cardo; a Madre escapa em qualquer escolha.

### Compatibilidade de saves (testado)

`cd tests && npm install && npm test` roda tudo no Chromium do Playwright:
- `old-saves`: os 9 saves de referência da 0.8.0 (`tests/saves/0.8.0/`: prólogo explorando, em conversa e em combate;
  Vau-de-Cardo; conversa e combate no Ato I; capítulo 1 terminado com e sem pacto, com e sem Nix) carregam com o mesmo
  estado e seguem jogáveis; os dois com `ch1_done` chegam ao capítulo 2.
- `ids`: os ids posicionais dos mapas antigos são idênticos na 0.8.0 e na versão nova, em três combinações de flags.
- `update`: a 0.8.0 com service worker recebe a versão nova, faz o save automático com o código velho e recarrega no novo.
- `chapter2`: o capítulo inteiro em três caminhos (paz, ataque, Coroa), com saves novos explorando, em conversa e em
  combate, recarregados e conferidos.
O formato do save não mudou (continua 1); nenhuma migração foi necessária.
- `rest`: o primeiro descanso em Vau-de-Cardo (fogueira e taverna). A oferta do Eco acontece com a tela escurecida, e a
  caixa de diálogo ficava por baixo do escurecimento (`#fade`): o jogador via só uma tela preta, com uma pergunta
  esperando resposta. Agora o diálogo fica por cima (`z-index` 42); o teste confere numa captura que a caixa aparece.

Desempenho (Firefox 158 em janela real 1920×1080, medidor F3, `tests/perf-firefox.mjs`): os mapas novos desenham em
2 a 4 ms por quadro, como o acampamento e Vau-de-Cardo (82-83 quadros/s de jogo).

Falta: Bosque de Lethiel, a Procissão Branca e a revelação de L.; recrutar Silas e Murta. O capítulo 2 foi jogado de
ponta a ponta por roteiro automático, não à mão; o equilíbrio dos combates não foi ajustado jogando.

## Revisão da história (0.9.1)

Uma rodada só de consertos no que já existia (prólogo, capítulos 1 e 2), sem história nova. As regras de escrita que
saíram dela estão em [docs/historia.md](docs/historia.md) §9.1 a §9.3, e o mapa de cada passo obrigatório e dos
caminhos para cumpri-lo em [docs/fluxo-historia.md](docs/fluxo-historia.md).

- **Respostas**: fala do herói sem aspas; ação do herói começa com verbo no infinitivo e aparece em itálico
  (`optionKind` em `src/dialogue.js`); `Kael: ...` quando outro responde por você.
- **Rolagens**: cada uma resolvida uma vez, com a falha gravada. Onde a rolagem era o único caminho de um passo
  obrigatório, há agora um caminho garantido.
- **Becos**: Tomé mandado para casa antes de mostrar a porta; o Eco que não vinha se a luta do Relicário acabasse antes
  do 4º turno. Saves presos nesses dois pontos se soltam ao carregar (`repair()` em `src/story.js`; saves de teste em
  `tests/becos/`, feitos com a 0.9.0).
- **Ordem**: falas e recompensas conferidas para cada ordem plausível (veja a lista no fim desta seção).

### Decisões (revisão)

1. **Rosalva e o recado sem a carta**: novo caminho garantido, `Abrir a mão no balcão e mostrar a marca.` A carta pode
   ser queimada no prólogo, e as duas rolagens viraram uma tentativa só. Mostrar a marca não tem custo de regras: o custo
   é ela saber (`rosalva_mark`, para uso futuro). Descoberta como Lembradora, ela também entrega o recado se pedirem.
2. **A coluna partida**: examinável (`Coluna partida`) depois de entrar nas ruínas. Com o Tomé conhecido ou depois de ele
   contar, a laje é achada sem rolagem; antes, uma rolagem (Investigação ou Percepção CD 12), uma vez.
3. **O Eco depois da luta**: se a luta com Cendra acabar antes do 4º turno sem ninguém cair, o momento do Eco acontece
   logo depois dela, com a mesma escolha. A fala de abertura muda ("a poeira da luta"), o resto é igual.
4. **A chave da cela**: nos ramos em que os guardas saem (pela mentira do Silas) ou voltam às xícaras, a chave fica
   num prego ao lado da porta. Arame e força continuam como alternativas, uma tentativa cada.
5. **O cofre do comandante**: cada jeito de passar pelo sargento é tentado uma vez (dia ou noite só muda a dificuldade);
   o suborno sempre funciona para quem tem ouro. Se o arame entortar, Nix abre o cadeado (com menos XP).
6. **Pipa levada ao pai antes da escolha**: o reencontro acontece na hora, com a mesma recompensa, e a manhã depois
   da escolha não o repete. Depois de a Coroa queimar o Mosteiro, a trilha do bosque para lá fica fechada.
7. **Dormir no Mosteiro** uma vez só: na segunda, o companheiro não deixa (antes, cada noite riscava outra lembrança
   e repetia a cena).
8. **Diário**: depois da escolha do Mosteiro, objetivos que ficaram abertos no capítulo 2 saem da lista; "Liberte a
   anã" só aparece depois de alguém falar dela; a missão de Pipa termina quando Abel ouve a resposta, com ou sem o
   passarinho.

### O que foi conferido e corrigido, por ordem

- **Prólogo**: Maren conta do neto mesmo se o Tomé já voltou (agora agradece) e dá a recompensa do neto uma vez, em
  qualquer ordem; Gorza não manda levar um menino que já foi; Silas não olha para uma criança que não está lá; a
  patrulha só é citada se ainda está na trilha; Otávio é comparado uma vez; a tela final diz o que houve com um Tomé
  que ninguém encontrou.
- **Capítulo 1**: Rosalva e Nix não se apresentam de novo na mesma conversa; o quarto de Rosalva lê se ela já é
  Lembradora; a procissão é convencida uma vez; Dário reage ao cartaz em vez de a Kael; Beni, Gorza e Murta comentam o
  que já aconteceu.
- **Capítulo 2**: Abel, Tadeu, Silas e Pipa não repetem a apresentação; Clara não fala de uma anã que já está no grupo;
  a Madre não oferece Hulda se ela já foi solta; o Sabiá conta quantos estão na sala; Hulda, no portão, sabe se o velho
  foi encontrado; o pão de Joana sai uma vez; o altar, a chaleira e o pedido a Pipa são tentados uma vez.
- **Português**: falas ao herói com gênero ("cansada/cansado", "a senhora/o senhor", "Obrigada/Obrigado",
  "forasteira/forasteiro"); "querido" de Lyra virou "meu bem", como ela fala no resto do jogo.

### Testes desta rodada

- `audit`: monta as 30 árvores de diálogo com 120 combinações de flags, itens, companheiros e ouro cada uma, e acusa
  nó inexistente, nó sem saída, rolagem que pode ser repetida depois de falhar, recompensa que pode ser pega de novo e
  resposta fora da regra das aspas. Escreve a lista de todas as respostas em `tests/out/respostas.txt`. As respostas das
  cenas (`ask()`) são conferidas no código-fonte, só quanto à regra de escrita.
- `story`: cinco jogadas até o fim de cada parte, com os dados viciados (`dice: "fail"` tira 1 em tudo, `"pass"` tira 20):
  prólogo com o Tomé mandado para casa primeiro e falhando tudo; prólogo pulando o opcional, a coluna antes do Tomé e o
  Relicário vencido de uma vez; capítulo 1 sem a carta, falhando tudo e com o opcional antes; capítulo 2 falhando tudo;
  capítulo 2 acertando tudo, com Pipa levada ao pai antes da escolha e a chave no prego. Fotos das falas corrigidas em
  `tests/out/historia-*.jpg`.
- `becos`: os saves presos da 0.9.0 carregam e saem do beco.

O que ficou de fora:
o equilíbrio das CDs não foi revisto, e as cenas com `ask()` não passam pela auditoria automática de rolagens (cada
uma é uma cena que só acontece uma vez, o que foi conferido lendo).

## Interface

A interface foi refeita com estrutura de Baldur's Gate 3 e acabamento de pixel art:

- **Barra de ações** com o retrato de quem age, custo de cada habilidade (ação, bônus, livre), contadores de
  espaços de magia e a economia do turno; **retratos do grupo** à esquerda; **ordem de iniciativa** no alto, com
  a rodada; **tooltips** com custo, alcance, dano, chance de acerto e por que algo está indisponível.
- **Diálogo** com retrato, placa de nome e opções numeradas. Testes de perícia mostram perícia, CD, quem rola,
  o bônus e a chance. O d20 mostra a conta (dado + bônus contra a CD).
- **Molduras 9-slice** ([src/art/frames.js](src/art/frames.js)), **ícones** num atlas único
  ([src/art/icons.js](src/art/icons.js), nenhum emoji) e uma **fonte pixel** com acentos, desenhada glifo a glifo
  e montada como TrueType em memória ([src/art/font.js](src/art/font.js)). Transições curtas, em degraus.
- A interface tem escala própria: 2 pixels de tela por pixel de interface em 1080p, 3 a partir de 1500 px de
  altura, 1,5 ou 1 em telas menores (nas frações a fonte perde um pouco de nitidez).

## Luz

Havendo WebGL2, o quadro inteiro é desenhado na GPU, com a luz ligada ou não (desligada, as cores saem como pintadas) ([src/light.js](src/light.js)): o código do jogo continua
chamando `drawImage`, `fillRect` e companhia, mas num substituto do contexto 2D que junta os sprites num atlas na GPU e
os desenha em lotes, em três camadas (chão, sprites, sobreposição). Copiar um canvas 2D para o WebGL a cada quadro,
como a primeira versão fazia, custa uma leitura de volta da GPU no Firefox e derrubava o jogo para 26 quadros por
segundo.

- **Fontes**: fogueiras, lanternas e janelas, Lumes e a marca do herói, magias e faíscas do pixelfx.
- **Ambiente** por área e por hora: o vale amanhece, as ruínas são um degrau mais escuras, o Relicário é frio,
  o fim do prólogo é ao pôr do sol, Vau-de-Cardo começa de noite. O relógio é movido pela história.
- **Sombras**: cada luz projeta um quadrilátero atrás de props e personagens, só sobre o chão.
- **Paleta**: a luz não mistura com branco nem preto. Uma tabela 3D, montada com todas as rampas da arte, diz
  qual é "um degrau acima" e "um degrau abaixo" de cada cor; a luz chega em degraus inteiros, e a borda entre
  dois degraus usa o mesmo dither Bayer 4×4 da arte, alinhado aos pixels do mundo.
- **Opções** (menu de pausa): desligada / baixa (sem sombras) / alta, e intensidade. **Desligada**, nenhuma luz ou
  sombra é calculada e o jogo aparece como antes. Sem WebGL2 o jogo cai no desenho 2D antigo, sem luz.

## Criação de personagem

Ao clicar em **Começar** você cria seu herói, num esquema parecido com uma ficha de mesa:
- **Gênero:** feminino, masculino ou não-binário (muda nomes sugeridos, títulos e algumas falas).
- **Raça:** humano, elfo, anão, halfling, meio-orc ou tiferino. Cada uma dá bônus de atributo e traços (sorte do halfling, meio-orc implacável, resistência ao fogo do tiferino...).
- **Classe:** guerreiro, bárbaro (Fúria), paladino (Golpe Divino, Cura pelas Mãos), patrulheiro, ladino, monge (Rajada de Golpes), bardo (Zombaria Viciosa, Inspiração), mago, bruxo (Rajada Mística, Maldição), clérigo ou druida (Criar Chama, Constrição).
- **Aparência:** pele, cabelo e cor, barba, olhos, roupa e capa, com prévia animada que dá para girar.
- **Atributos:** compra de 27 pontos (8 a 15), com a distribuição sugerida para a classe.

A ficha à direita mostra PV, CA, ataques, perícias e o companheiro que entra no grupo (Kael para conjuradores, Lyra para os demais).
Nos testes de diálogo, quem rola é o membro do grupo com o maior bônus naquela perícia.
Regras em [src/rules.js](src/rules.js), tela em [src/creator.js](src/creator.js).

## Equipamento

Cada personagem tem quatro espaços: **arma**, **arma à distância**, **armadura ou roupa** e **escudo**. O catálogo fica em [src/items.js](src/items.js):
- **Armas por tipo:** adagas, espadas (curta, cimitarra, longa, montante), machados, maças e martelos, lanças e hastes (a alabarda ataca a 2 casas), cajados, arcos e bestas. Cada uma tem dado de dano, categoria (simples/marcial) e propriedades (acuidade, pesada, duas mãos).
- **Armaduras e roupas:** de roupas de viagem a cota de malha. Mudam a CA, o limite de Destreza e às vezes a Furtividade ou o movimento.
- **Peças raras com efeitos:** Adaga de Velmoor (+1d4 contra Esvaídos), Machado de Gorza (crítico em 19–20), Cajado de osso da Avó (+2 nas magias de fogo), Manto de Bruma (imune a Esquecido), Escudo de Ormun (metade do dano de fogo).
- O sprite muda com o que se veste e empunha: cota de malha, couro com rebites, gibão de peles, robes, escudo no braço, lança, martelo, montante.

No criador, a aba **Equipamento** escolhe o kit inicial da classe. No jogo, a aba **Equipamento** da Bolsa (`I`) mostra a comparação de CA e ataque antes de trocar. Kael e Lyra também podem ser equipados.

## Controles

Tudo funciona com mouse, teclado e gamepad. As teclas mostradas na tela acompanham o último aparelho usado.

| | Mouse / teclado | Gamepad |
|---|---|---|
| Andar | clique no chão, ou WASD / setas | alavanca esquerda ou D-pad |
| Correr | segurar `Shift`, ou clique duplo no chão | segurar B |
| Interagir, confirmar | clique, `E`, `Enter` | A |
| Barra de ações | `1–9`; `Tab` move o destaque e `F` usa | LB / RB movem o destaque, X usa |
| Combate | clique no quadrado ou no alvo; setas / WASD movem um cursor de quadrado | D-pad move o cursor, A confirma |
| Encerrar o turno | `Espaço` | Y |
| Acelerar o combate | segurar `Shift` (ou a opção Combate rápido) | no menu |
| Cancelar, voltar | `Esc`, botão direito | B |
| Bolsa / Diário | `I` / `J` | Select / Y |
| Trocar de aba nos menus | `Q` / `E` | LB / RB |
| Menus | setas e `Enter` | D-pad e A; alavanca direita rola a página |
| Opções | `Esc` ou `P` | Start |
| Trocar de personagem | `Tab`, ou clique no retrato | atalho na barra de ações |
| Som | `M` | no menu |
| Perspectiva 3D | `V` | no menu |

No d20, `Espaço`/A continua e `L`/X usa o Lampejo de Velmoor. `H`/Select fecha a dica do tutorial.

## Perspectiva 3D

O jogo abre com a câmera inclinada sobre o vale, num estilo parecido com o "Mode 7" dos consoles antigos:
- O **chão** (terreno, água, sombras, grade de combate, reflexos, a Bruma) é desenhado plano e depois deitado num plano em perspectiva, linha por linha: o que está longe encolhe e some numa névoa de distância; o que está perto cresce.
- Tudo o que fica **de pé** (personagens, árvores, muros, efeitos, barras de vida, vaga-lumes) é um *billboard*: continua ereto, ancorado nos pés e escalado pela distância. Na linha do líder a escala é 1, então o grupo fica idêntico à vista plana.
- O clique é projetado de volta no chão; em combate, clicar no corpo de alguém escolhe a casa dessa pessoa.
- `V` alterna entre a vista 3D e a vista de cima. No menu (`Esc`) há a opção **Perspectiva 3D** e o controle **Inclinação da câmera**; a escolha fica salva no navegador.
- Com a **luz** ligada a vista 3D também é desenhada em WebGL: o chão plano vai para uma textura e é deitado de lá; luzes e sombras são projetadas para a tela e escaladas pela distância.

Código em [src/persp.js](src/persp.js) (a projeção) e na função `draw` de [src/main.js](src/main.js). O porte para Unity continua com a vista de cima.

## Arte

A skill do projeto `.claude/skills/topdown-pixelart` descreve o estilo e o ciclo para criar novos assets
(rascunho → folha de contato → olhar → corrigir).

## Som

Todo o áudio é sintetizado em tempo real com Web Audio em [src/audio.js](src/audio.js), sem arquivos de som:
- **Música** gerada por um sequenciador: `meadow` (alaúde, flauta e cordas em Ré maior), `ruins` (lá menor, esparsa,
  com drone), `combat` (tambores, baixo ostinato e metais), `abbey` (o Mosteiro: um canto em quintas paralelas e o
  sino da casa) e `town` (Vau-de-Cardo: alaúde em si menor e o tema do menu, grave). As faixas fazem crossfade conforme a área e o modo.
- **Ambiente**: vento, água do lago, estalos da fogueira, pássaros nos campos e gotas nas ruínas, pela posição do líder.
- **Efeitos**: passos por superfície (grama, terra, pedra, madeira), espada, magias, poções, d20, baús, vitória e derrota.

Para ouvir cada som isolado e ajustá-lo de ouvido, abra a mesa de som em `http://localhost:5173/tools/sfx.html`.

## Refinamento (0.10.0)

Uma rodada de melhoria do que já funcionava, do prelúdio ao fim do capítulo 2, sem história nova. O diagnóstico, em
ordem de impacto, e o estado de cada item ficam em [docs/refinamento.md](docs/refinamento.md).

- **Subir de nível** ([src/levelup.js](src/levelup.js)): uma tela no padrão do criador mostra o que cada um ganhou e
  pede uma escolha: uma habilidade nova da classe (`LEVEL_POOL` em [src/rules.js](src/rules.js)), +2 num atributo ou
  uma perícia nova. Os companheiros chegam com uma sugestão marcada, que dá para trocar. A escolha fica na ficha
  (`build.extraAbilities`, `build.asi`, `build.extraSkills`, `build.picks`).
- **Companheiros** ([src/companions.js](src/companions.js), falas em [src/companion-lines.js](src/companion-lines.js)):
  a aprovação aparece num aviso discreto (retrato e "gostou" / "não gostou", sem número) e na aba **Grupo** do Diário,
  em palavras. Aprovação 3 ou mais: o companheiro ajuda nos testes (+1, dito na opção) e abre a conversa pessoal da
  fogueira; −4 ou menos: ele confronta o herói uma vez e para de rolar testes por ele. Comentários sobre os lugares e
  as coisas, e conversas entre eles na estrada, em balões sobre a cabeça; nunca em luta, conversa ou cena.
- **Fogueira de histórias** ([src/campfire.js](src/campfire.js)): depois de um descanso sem cena própria, o jogador
  escolhe com quem conversar. Cada companheiro tem três histórias; ouvir uma vira lembrança. Contar uma lembrança sua a
  **ancora**: o chá do Mosteiro não leva lembrança ancorada.
- **Relíquias de Velmoor** ([src/relics.js](src/relics.js)): seis objetos da noite do ritual, um por lugar, para ler na
  Bolsa; cada um dá +1 numa perícia, e os seis juntos viram uma lembrança.
- **Combate**: clicar num inimigo usa a ação que faz sentido (o truque de um mago, o arco à distância); "Errou: 9
  contra CA 13" na cena; "a seguir" na faixa de iniciativa; ícones de condição (*Esquecido*, abalado, lento, marcado,
  em guarda...) sobre a unidade, na faixa e na dica; opção **Combate rápido** e `Shift` acelerando; a IA foca quem está
  ferido ou mal protegido, recua quase morta e protege o chefe; Gorza, Hesta e Corvino dão uma ordem quando feridos, a
  Avó e a Irmã Sálvia curam uma vez.
- **Clareza e ritmo**: marca discreta do próximo passo da missão principal ([src/objective.js](src/objective.js)),
  que só aparece depois de 25 segundos sem progresso e pode ser desligada; **correr** com `Shift`, o B do controle ou
  clique duplo; os testes dizem o atributo de que dependem; falas seguidas da mesma pessoa numa caixa só; o registro
  do combate some depois da luta; seis dicas novas no tutorial.
- **Mundo**: Vau-de-Cardo tem moradores com rotina e falas de fundo que reagem ao que o grupo fez
  ([src/town.js](src/town.js)); o Mosteiro e a cidade têm músicas próprias; o Relicário e o sonho foram revistos com a
  luz ligada.

### Decisões (refinamento)

1. **Ninguém vai embora** com aprovação muito baixa: o roteiro conta com Kael ou Lyra em quase toda cena. A
   consequência é o confronto e a recusa de ajudar nos testes, até a relação melhorar.
2. **Aprovação de Nix e Hulda** sai das escolhas que já existiam (a Lume, o livro de nomes, o chá, Pipa, a escolha do
   Mosteiro, a troca com o Eco). Nix começa conforme o que foi feito com a Lume.
3. **A fogueira** só abre nos descansos sem cena própria. As três noites roteirizadas continuam iguais.
4. **Lembrança ancorada** protege do chá do Mosteiro (o único lugar que tira uma lembrança sem o jogador escolher).
5. **Habilidades novas** usam as regras que o combate já tinha onde possível (Comando e Cantiga de Ninar são o
   mesmo teste da Constrição, com outro nome e outro aviso).
6. **Sem viagem rápida**: os mapas do Ato I são vizinhos e a história dispara cenas pelas bordas. Correr resolve a maior
   parte da caminhada.
7. **Sem interiores** em Vau-de-Cardo nesta rodada: o esforço foi para a cidade de fora estar viva.

### Saves

O formato continua 1, sem migração. O que é novo tem valor padrão para saves antigos:
- personagens acima do nível 1 sem escolhas feitas recebem as escolhas pendentes ao carregar, com sugestão
  (`pendingPicks` em `src/rules.js`); o save 0.8.0 com o grupo no nível 3 abre a tela com duas escolhas para cada um;
- `G.barks` (as falas já ditas) entrou na lista do save; um save antigo começa sem nenhuma;
- os baús das relíquias e os moradores entram **no fim** das listas de cada mapa (ids por posição); o `restore()` põe
  de volta os moradores que um save antigo não lista (`resident`);
- `tests/ids.test.mjs` agora aceita ids novos e só falha se um id antigo mudar de dono; a comparação de estado dos
  testes ignora os baús acrescentados no fim e os moradores, que andam.

### Testes desta rodada

`cd tests && npm install && npm test`. Os testes acham o Chromium do Playwright em `/opt/pw-browsers/chromium` ou em
`PW_CHROMIUM`, quando a versão instalada não é a do `package.json`.
- `levelup`: a tela abre sozinha, "Depois" e o "+" do retrato, a escolha fica no save; o save 0.8.0 no nível 3; cada
  uma das 17 habilidades novas numa luta de verdade.
- `companions`: o aviso de aprovação, a ajuda nos testes e a fala que muda com aprovação alta e baixa; o confronto;
  nenhum comentário durante luta ou conversa, e os ditos ficam no save; a fogueira (história, a pessoal que espera
  aprovação, a lembrança ancorada).
- `audit` passou a conferir as respostas do herói escritas em `companion-lines.js` e `campfire.js`.
- `tour.mjs` (não é teste): `node tour.mjs antes|depois` joga duas partidas e tira as fotos do diagnóstico.

## O que ficou faltando

- **Desempenho**: medido só em Chromium sem janela (o desenho é por software lá, e engana). A medida pedida, numa janela
  real do Firefox em 1080p com o F3, não pôde ser feita nesta máquina. O que foi acrescentado ao mundo é pouco: cinco
  moradores andando só em Vau-de-Cardo, balões em DOM e uns ícones de condição durante o combate. **F3** (ou `?fps`)
  mostra quadros por segundo e o tempo de cada parte do desenho; vale medir antes de publicar.
- **Interiores de Vau-de-Cardo** (taverna, guarnição): não feitos.
- **Equilíbrio**: as CDs e os combates não foram ajustados jogando à mão; a IA nova foca o mais frágil, o que pode
  deixar algumas lutas mais duras para um mago.
- **Texto**: alguns momentos de cena ainda têm quatro caixas seguidas antes de uma escolha (Cendra no Relicário, o
  Sabiá na cela).
- **Luz**: os sprites são iluminados pela posição na tela, sem altura; as sombras caem só no chão. Sem WebGL2, a vista
  3D em canvas 2D é lenta (use a vista de cima, `V`).
- **Gamepad**: não dá para digitar o nome do herói (use o botão de nome aleatório); sem remapeamento de teclas.
- **Ato I**: faltam o Bosque de Lethiel, a Procissão Branca e a revelação de L. Murta e Silas ainda não podem ser
  recrutados.
- **Versão Unity** (`unity/`): não recebeu nada disto.
