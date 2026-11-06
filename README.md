# Brumafolha

Protótipo de RPG tático top-down em pixel art: exploração, diálogos com testes de d20 e combate por turnos
(iniciativa, movimento em grade, ação + ação bônus, CA, magias com espaços), no navegador, sem build.

Toda a arte é gerada por código no carregamento (`src/art/`). Os efeitos de combate (fogo, mísseis,
golpes, cura) vêm do [pixelfx](https://github.com/patch-gg/pixelfx) (MIT), copiado em `vendor/pixelfx`.

## Versão em C

Há um port em C/SDL2 com os mesmos gráficos e comportamento em [`c/`](c/README.md): `cd c && make && ./brumafolha`.

## Rodar

```bash
python3 tools/serve.py
```

Abra http://localhost:5173. A folha de assets fica em http://localhost:5173/tools/sheet.html.

## Controles

- Clique no chão para andar (ou WASD). Clique em personagens/baús para interagir, `E` interage com o que está perto.
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
