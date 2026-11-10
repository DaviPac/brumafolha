# Prompt: remake de Brumafolha em Unity (do jeito Unity)

Crie um projeto Unity novo em `/home/davipac/Desktop/codigos/AAA/jogos/rpg-game-unity`: um remake de **Brumafolha**,
RPG tático top-down (3/4) em pixel art, a partir da versão web em `/home/davipac/Desktop/codigos/AAA/jogos/rpg-game`.

Não é um port linha a linha. A tentativa anterior (`rpg-game/unity/`) imitou o canvas com `GL.QUADS` e `OnGUI` e
reescreveu os efeitos de forma simplificada. **Não use esse código como base**: ele serve só como referência de
regras, se ajudar. Aqui o jogo deve usar os sistemas da própria Unity: cenas, prefabs, sprites, Tilemap, Animator,
ScriptableObjects, Input System e UI de verdade.

## A fonte da verdade

- `rpg-game/src/` contém o jogo web inteiro (~7,5k linhas JS): `main.js` (loop, câmera, exploração, modos), `story.js`
  (prólogo, eventos e diálogos), `combat.js`, `rules.js` (raças, classes, atributos, d20), `items.js`, `creator.js`,
  `journal.js`, `tutorial.js`, `dialogue.js`, `world.js` e `maps.js` (mapas: vale, sonho de Velmoor, Relicário),
  `path.js` e `audio.js` (som 100% sintetizado com Web Audio).
- `rpg-game/src/art/` contém toda a arte, gerada por código no carregamento: `chars.js` (personagens 26×36 com pés em
  (13,34), 4 direções, caminhada de 4 quadros, ataque e conjuração), `props.js`, `ground.js` e `interiors.js`.
- `rpg-game/vendor/pixelfx/` é a biblioteca de efeitos (MIT; mantenha o `LICENSE`/`NOTICE.md` no projeto novo).
  Ela é determinística por `seed` e simula a 120 Hz fixos. Cada efeito desenha numa camada de **cor** e numa
  camada de **luz** (somada por cima), com partes `back`/`front` em relação ao personagem (`src/core/fx.js`).
  O jogo usa: campfire, fireball, hitSpark, critHit, swordSlash, poof, healing-bloom, butterfly, fireflies e
  falling-leaves (`src/fx.js`).
- `rpg-game/docs/historia.md` é a bíblia da história e `rpg-game/docs/planta-prologo.html` é a planta dos mapas.
- `rpg-game/tools/sheet.html` mostra a folha de assets e `rpg-game/tools/sfx.html` os sons.
- A skill `rpg-game/.claude/skills/topdown-pixelart/SKILL.md` descreve o estilo visual. Copie-a para o projeto novo.

Rode a versão web (`python3 tools/serve.py`, porta 5173) para ver como tudo deve parecer, soar e se comportar.

## Regra principal: gráficos e efeitos idênticos

Os gráficos do mundo (chão, água, props, personagens, interiores) e os efeitos especiais devem ficar **iguais pixel a
pixel** aos da web. Para garantir isso, **não reescreva os geradores em C#. Exporte os resultados deles.**

### 1. Pipeline de bake (`Tools~/bake/` no projeto novo, Node + navegador headless)

Escreva um exportador que importa os módulos JS originais (diretamente de `rpg-game/src` e `rpg-game/vendor/pixelfx`,
sem copiar e modificar a lógica deles) e grava PNGs + JSON de metadados em `Assets/Art/Baked/`:

- **Personagens:** spritesheet por personagem/variante (todas as `SPECS` e as combinações de raça/classe/visual que o
  criador permite), com 4 direções × (parado, 4 de caminhada, ataque, conjuração). O pivô fica nos pés (13,34).
  - Se as combinações do criador forem demais para bakear, bake por **camadas** (pele, cabelo, roupa, arma...) que
    se empilham em tempo de execução. Verifique contra o render original.
- **Props e interiores:** um PNG por prop/variação, pivô na base, com as faixas de folhagem separadas onde a web
  faz o balanço do vento. O balanço deve ficar igual (shader de vertex/UV por faixa ou faixas como sprites).
- **Chão:** é pintado por pixel com ruído e campos contínuos, não por tiles. Exporte cada mapa em **chunks**
  (por exemplo 512×512 px) como sprites. Exporte também os dados lógicos do mapa (tipo de tile, caminhável,
  água, interagíveis, spawns) em JSON para virar Tilemap de colisão e dados de cena.
- **Efeitos pixelfx:** para cada efeito, avance com passo fixo e grave as folhas `*_color.png` e `*_light.png`
  (e `*_back_*` quando houver), com fps, loop, pivô e duração no JSON. Gere de 3 a 4 seeds por efeito.
  - Para efeitos com paleta variável, bake em índice de rampa (tons de cinza) e troque a paleta por shader.
  - Para os de ambiente (borboleta, vagalume, folha), bake **um indivíduo animado** e espalhe com `ParticleSystem`
    igual à distribuição da web.
- **Ícones** não precisam vir daqui: veja a seção de interface.

O bake deve ser reexecutável com um comando (`npm run bake`) e idempotente. Quem mexer na arte web e rebakear deve
receber o asset atualizado na Unity sem retrabalho manual.

### 2. Importação automática

Escreva um `AssetPostprocessor` que, para tudo em `Assets/Art/Baked/`:
- configure Point filter, sem compressão, sem mipmaps, PPU = 32 (1 tile = 1 unidade) e pivôs do JSON;
- fatie as spritesheets e gere `AnimationClip`s e Animator Controllers (ou um animador de flipbook próprio, se for
  mais simples) para personagens e efeitos;
- gere prefabs de efeito (`Fx/Fireball.prefab` etc.): `SpriteRenderer` de cor + filho de luz com material
  **aditivo**, ordenação back/front em relação ao personagem e pooling.

### 3. Renderização

- URP 2D Renderer com **Pixel Perfect Camera**: tile de 32 px e escala inteira que acompanha a web (escala 3 com
  altura ≥ 1000, 2 com ≥ 520, senão 1). O snap de pixel deve ser exato.
- Ordenação por Y (Transparency Sort Axis (0,1,0)) com pivôs nos pés e na base dos props.
- Não ligue Light2D, pós-processamento nem nada que mude as cores do mundo, a menos que reproduza exatamente um
  efeito da web.
- Reproduza com shaders (Shader Graph ou HLSL) o que a web faz em tempo real:
  - **reflexo na água** do que está nas margens (árvores, cais, barco, grupo), com ondulação;
  - **a Bruma** (névoa que recua com a fogueira e persegue o grupo no final do prólogo);
  - **brilhos e luz** (fogueira etc.).
  Leia `main.js`/`story.js` para pegar parâmetros e cores exatos.

### 4. Verificação visual obrigatória

Faça um teste (Edit Mode/Play Mode test ou ferramenta de editor) que captura cenas e efeitos fixos (mesma seed, mesmo
tempo, mesma câmera) na Unity e compara pixel a pixel com capturas da web geradas pelo pipeline de bake. Inclua pelo
menos: o acampamento com fogueira, a margem do lago com reflexo, o Relicário, cada efeito em 3 instantes e cada
personagem em cada pose. Diferença zero é a meta. Documente qualquer exceção e o motivo.

## Arquitetura de jogo (do jeito Unity)

- **Cenas:** `Boot`, `MainMenu`, `CharacterCreator` e uma cena por mapa (`Vale`, `SonhoVelmoor`, `Relicario`),
  carregadas de forma aditiva por um `GameManager` persistente.
- **Dados em ScriptableObjects:** raças, classes, atributos, perícias, itens, armas, armaduras, magias, inimigos,
  personagens, paletas e definições de efeito. Tudo que hoje é tabela em `rules.js`/`items.js` vira asset editável.
- **Diálogos e história:** converta os diálogos de `story.js` para dados, seja grafo de diálogo em ScriptableObjects
  ou Ink (pacote `ink-unity-integration`), com testes de d20, condições e flags. Eventos roteirizados (sonho, a Bruma
  subindo, fuga até o cais, barco no Cardo) viram Timeline ou sequências em C# chamadas pelos dados. O texto do jogo
  continua em **português**, igual ao da web.
- **Combate tático:** máquina de estados (iniciativa → turno → movimento em grade → ação + ação bônus → reação),
  pathfinding na grade (A*, como `path.js`), CA, ataques, dano, espaços de magia e IA dos inimigos. As regras devem
  ser **idênticas** às da web; cubra-as com testes Edit Mode.
- **Input System:** mouse (clicar para mover/agir), teclado (WASD, E para interagir, Tab para trocar de líder, 1–9
  para a hotbar, como em `main.js`) e gamepad.
- **Save/load:** grupo, inventário, flags da história, mapa e posição, em JSON, com mais de um slot.
- **Áudio:** a web sintetiza tudo em tempo real. Exporte os sons com o mesmo pipeline de bake (`OfflineAudioContext`):
  SFX como arquivos, ambiências como loops sem emenda e música como loops ou trechos por clima (prado, ruínas,
  combate, stings). Use AudioMixer com grupos música/ambiente/SFX/UI e o reverb equivalente. Se a música generativa
  perder muito ao virar loop, avise e proponha uma alternativa antes de decidir.
- Código em `Assets/Scripts/` com assembly definitions (`Brumafolha.Core`, `.Combat`, `.Story`, `.UI`, `.Editor`,
  `.Tests`), namespaces e nada de classes gigantes como o antigo `Game.cs`.

## Interface: pode (e deve) mudar

A interface web é simples. No remake, ela deve ter cara de **jogo**, mantendo a coerência com o mundo em pixel art
(quente, tinta escura, ver a skill de pixel art):

- Use UI Toolkit ou uGUI e escolha a que der o melhor resultado com pixel art e gamepad. Painéis em 9-slice com moldura
  desenhada em pixel art, fonte pixel legível com acentuação completa do português, botões com estados (hover,
  pressionado, desabilitado, foco de gamepad) e transições curtas.
- **Ícones novos em pixel art** (itens, armas, magias, status, menus), num atlas, desenhados no estilo do jogo: luz
  do canto superior esquerdo e contorno escuro. Podem ser gerados por código no pipeline de bake ou desenhados como
  PNG, mas devem ser consistentes entre si.
- Telas: menu principal, criador de personagem (preview animado do personagem), HUD de exploração (retratos do
  grupo, vida, hotbar), HUD de combate (ordem de iniciativa, ações, alcance e área no chão, rolagem de d20 animada),
  caixa de diálogo com retrato e opções de teste (perícia + CD), inventário/equipamento, diário, opções (áudio,
  escala, controles) e tela de save/load.
- O tutorial (`tutorial.js`) vira dicas contextuais no novo estilo.

## Ordem de trabalho

1. Projeto Unity 6 (6000.3.x LTS) + URP 2D + Input System + pastas, assemblies, `.gitignore` e `git init`.
2. Pipeline de bake e importação, com personagens, props, chão de um mapa e os 10 efeitos. Rode o teste de
   comparação visual **antes** de construir o resto.
3. Exploração no Vale: andar, câmera, colisão, ordenação, interação, reflexo na água e Bruma.
4. Dados (ScriptableObjects), criador de personagem e grupo.
5. Diálogos e história do prólogo inteiro, nos três mapas.
6. Combate.
7. Interface nova, áudio, save/load e opções.
8. Build para Linux e Windows e um `README.md` (como abrir, rebakear e rodar os testes).

Em cada etapa, rode o jogo e compare com a versão web. Não declare uma etapa pronta sem ter jogado o trecho
correspondente nas duas versões.
