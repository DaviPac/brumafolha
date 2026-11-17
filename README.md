# Brumafolha

RPG tático top-down em pixel art: exploração, diálogos com testes de d20 e combate por turnos
(iniciativa, movimento em grade, ação + ação bônus, CA, magias com espaços), no navegador, sem build.

Toda a arte é gerada por código no carregamento (`src/art/`): cenário, personagens, ícones, molduras da
interface e até a fonte. Os efeitos de combate (fogo, mísseis, golpes, cura) vêm do
[pixelfx](https://github.com/patch-gg/pixelfx) (MIT), copiado em `vendor/pixelfx`. Não há nenhum arquivo de
imagem, som ou fonte, e nada é baixado da rede.

## Rodar

```bash
python3 tools/serve.py
```

Abra http://localhost:5173. A folha de assets fica em http://localhost:5173/tools/sheet.html
(`?only=icons` mostra só o atlas de ícones).

Atalhos de desenvolvimento: `?dev=camp` pula título, criador e sonho; `?dev=ato1&f=goblin_pact,maren_aboard,maren_lucid,tome_alive`
começa no Ato I como se o prólogo tivesse terminado com essas flags (`&cls=mago`, `&race=elfo` escolhem o herói; `&u=2` força a escala da interface).

## Menu inicial

O jogo abre num menu com o vale vivo ao fundo: a câmera passeia devagar sobre o Lago Espelhado ao entardecer.
Opções: **Novo jogo**, **Continuar** e **Carregar jogo** (desligados até o salvamento existir, ver
[docs/salvamento.md](docs/salvamento.md)), **Opções** (o mesmo painel do menu de pausa) e **Créditos**.

Na **primeira vez** que o jogo é aberto, há uma abertura: uma folha cai no escuro, girando e mostrando ora o verde,
ora o lado prateado de baixo (de onde vem o nome do vale), pousa onde fica o nome, e "Brumafolha" surge letra por
letra. Nas próximas vezes, uma versão curta. Qualquer tecla ou clique pula. A abertura é feita com animações CSS e não
com timers, porque toca enquanto o vale é pintado, e esse trabalho ocupa o navegador por um ou dois segundos.
Código em [src/title.js](src/title.js).

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
| Interagir, confirmar | clique, `E`, `Enter` | A |
| Barra de ações | `1–9`; `Tab` move o destaque e `F` usa | LB / RB movem o destaque, X usa |
| Combate | clique no quadrado ou no alvo; setas / WASD movem um cursor de quadrado | D-pad move o cursor, A confirma |
| Encerrar o turno | `Espaço` | Y |
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
  com drone) e `combat` (tambores, baixo ostinato e metais). As faixas fazem crossfade conforme a área e o modo.
- **Ambiente**: vento, água do lago, estalos da fogueira, pássaros nos campos e gotas nas ruínas, pela posição do líder.
- **Efeitos**: passos por superfície (grama, terra, pedra, madeira), espada, magias, poções, d20, baús, vitória e derrota.

Para ouvir cada som isolado e ajustá-lo de ouvido, abra a mesa de som em `http://localhost:5173/tools/sfx.html`.

## O que mudou nesta rodada, e o que ficou faltando

Feito, em quatro etapas (um commit cada): ícones em atlas no lugar de todos os emojis; interface nova com fonte e
molduras geradas por código, jogável por mouse, teclado e gamepad; luz dinâmica em WebGL2; e o primeiro capítulo
do Ato I.

Como foi verificado: num Chrome sem cabeça, em 1920×1080, com um roteiro automático que joga o capítulo do cais
até a mensageira (variante com pacto goblin) e outro que cobre o cofre, a entrada de Nix, a cena de Tomé e a
emboscada de Murta. O gamepad foi testado só com um controle simulado (`navigator.getGamepads` falso), não com
um controle de verdade.

Falta, ou ficou pela metade:

- **Desempenho**: medido nesta máquina (RTX 3060 de notebook, tela de 165 Hz) numa janela real do Firefox com
  960×497 de jogo. Vista de cima, nas ruínas, luz alta: 7 ms de desenho, 83 quadros por segundo. Vista 3D, no
  acampamento: luz alta 12 ms e 62 quadros por segundo; luz desligada 14 ms e 52 a 56 (medido com a máquina ocupada
  por outros programas). Testes em navegador sem janela enganam: lá o canvas 2D não é acelerado e os custos são
  outros. Em telas acima de 100 Hz o jogo desenha um quadro sim, um não. Não foi medido em máquinas fracas. **F3**
  (ou `?fps` no endereço) mostra quadros por segundo e o tempo de cada parte do desenho.
- **Sem WebGL2**, a vista 3D em canvas 2D é lenta (9 quadros por segundo no Firefox); nesse caso use a vista de cima (`V`).
- **Efeitos do pixelfx** (fogueira, magias) são o maior custo que resta: são pintados pixel a pixel em JavaScript.
- **Luz**: os sprites são iluminados pela posição na tela, sem altura (a copa de uma árvore na frente de uma
  fogueira clareia como se estivesse no chão). As sombras caem só no chão, não sobre outros sprites. Cores que
  não estão em nenhuma rampa (misturas com transparência) seguem a rampa mais próxima, então o degrau é aproximado
  nelas. O Relicário e o sonho com a luz ligada não foram revisados visualmente.
- **Prólogo com a interface nova**: foram conferidos acampamento, corça, patrulha, criador e menus. O prólogo
  inteiro não foi rejogado do sonho ao barco, e o botão "Continuar: Ato I" da tela final foi testado só pelo
  atalho `?dev=ato1`.
- **Sem jogo salvo**: fechar a aba perde o progresso.
- **Gamepad**: não dá para digitar o nome do herói (use o botão de nome aleatório); sem remapeamento de teclas.
- **Ato I**: faltam o Mosteiro do Véu Sereno (Hulda, a Madre), o Bosque de Lethiel, a Procissão Branca e a
  revelação de L. Murta e Silas ainda não podem ser recrutados. A aprovação dos companheiros é registrada mas
  ainda não muda nada. A lembrança entregue ao Eco fica riscada no Diário, mas nenhum diálogo depende dela ainda.
- **Vau-de-Cardo** não tem interiores: a taverna atende no pátio. Os moradores não têm rotina.
- **Versão Unity** (`unity/`): não recebeu nada disto.

