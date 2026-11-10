# Brumafolha

Protótipo de RPG tático top-down em pixel art: exploração, diálogos com testes de d20 e combate por turnos
(iniciativa, movimento em grade, ação + ação bônus, CA, magias com espaços), no navegador, sem build.

Toda a arte é gerada por código no carregamento (`src/art/`). Os efeitos de combate (fogo, mísseis,
golpes, cura) vêm do [pixelfx](https://github.com/patch-gg/pixelfx) (MIT), copiado em `vendor/pixelfx`.

## Rodar

```bash
python3 tools/serve.py
```

Abra http://localhost:5173. A folha de assets fica em http://localhost:5173/tools/sheet.html.

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

No criador, a aba **Equipamento** escolhe o kit inicial da classe. No jogo, a aba **⚔️ Equipamento** da Bolsa (`I`) mostra a comparação de CA e ataque antes de trocar. Kael e Lyra também podem ser equipados.

## Controles

- Clique no chão para andar (ou WASD). Clique em personagens/baús para interagir, `E` interage com o que está perto.
- `I` abre a Bolsa, `J` abre o Diário (missões e lembranças).
- `Tab` troca o personagem controlado. A fogueira do acampamento faz um descanso longo.
- Combate: clique num quadrado para mover, num inimigo para atacar; `1–5` escolhe a ação; `Espaço` encerra o turno; botão direito/`Esc` cancela.
- `Esc` ou `P` (ou o botão ☰ no canto superior esquerdo) abre o menu de pausa, com volume separado para música, ambiente e cada tipo de efeito (golpes e magias, passos, fanfarras, interface, mundo). `M` liga/desliga o som.

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
