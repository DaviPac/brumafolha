# Brumafolha em C

Port em C (C11 + SDL2 + SDL2_ttf) do protótipo web: mesmo mundo, mesma arte gerada por código, mesmos
efeitos do pixelfx, mesmo combate, diálogos, interface e som sintetizado. Cada arquivo em `src/` corresponde
ao arquivo JS de mesmo papel (`world.c` ↔ `world.js`, `props.c` ↔ `art/props.js`, `effects.c` ↔ os efeitos
do `vendor/pixelfx`, `combat.c` ↔ `combat.js`…), para que as duas versões continuem fáceis de comparar.

## Compilar e rodar

```bash
sudo apt install libsdl2-dev libsdl2-ttf-dev   # Debian/Ubuntu (macOS: brew install sdl2 sdl2_ttf)
cd c && make
./brumafolha
```

Para gerar um pacote que roda em outras máquinas Linux x86-64 (glibc 2.35+, como Ubuntu/Pop!_OS 22.04 e
mais novos): `make dist` → `dist/brumafolha-linux-x86_64.tar.gz`. Extraia e rode `./brumafolha.sh`; ele só
precisa do SDL2 do sistema (`sudo apt install libsdl2-2.0-0`) e traz o SDL2_ttf caso falte.

O executável procura a pasta `assets/` ao lado dele (ou no diretório atual). Os controles são os mesmos
da versão web (clique/WASD, `E`, `Tab`, `1–5`, `Espaço`, `Esc`/`P`, `M`). Os volumes do menu de pausa ficam
salvos no diretório de preferências do SDL (`~/.local/share/brumafolha/`).

## Como a versão web foi traduzida

- **Mundo e arte** (`world.c`, `ground.c`, `props.c`, `chars.c`): os mesmos geradores, com o mesmo RNG
  (mulberry32), o mesmo `hash2` e o mesmo arredondamento do `Uint8ClampedArray`, então o vale sai pixel a pixel
  igual ao do navegador.
- **Canvas** (`canvas.c`): a cena é desenhada numa imagem de baixa resolução (como o `<canvas>`) e ampliada
  por 1×, 2× ou 3× conforme a altura da janela, com a mesma regra do `resize()`.
- **pixelfx** (`pfx.c`, `effects.c`): pintor, partículas, luzes e os 7 efeitos usados (fogueira, bola de fogo,
  faísca, crítico, corte de espada, poof e flor de cura).
- **Áudio** (`audio.c`): um pequeno motor no estilo Web Audio — osciladores, ruído branco/marrom, filtros
  biquad com as fórmulas da especificação, automação de parâmetros (`setValueAtTime`, rampas, `setTargetAtTime`,
  curvas), reverb por convolução com a normalização do Chrome e compressor + limitador — para que cada som
  e a música gerativa sejam a mesma receita do `audio.js`.
- **async/await** (`co.c`): turnos, projéteis, testes de d20 e esperas rodam como corrotinas (`ucontext`);
  `setTimeout` vira uma fila de timers.
- **Interface** (`ui.c`, `text.c`): o HTML/CSS refeito com SDL nas medidas do `style.css`, com as fontes do
  jogo (Cinzel e Pixelify Sans), kerning via HarfBuzz, versaletes sintetizados como no Chrome, sombras de texto
  com desfoque e os emojis da barra de ações pré-renderizados em `assets/icons` (`tools/bake_icons.c`).

## Checagem automática

`BRUMA_SMOKE=saida.bmp BRUMA_SCENE=<cena>` roda uma cena sem interação, salva um quadro e sai
(cenas: `title`, `explore`, `dialogue`, `dice`, `combat`, `pause`, `over`, `autoplay`). Com
`SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy` funciona sem tela nem som; foi assim que as capturas
foram comparadas com a versão web. `BRUMA_SECONDS` muda a duração da cena e `BRUMA_PERF=1` imprime
o tempo médio por quadro (update, desenho do mundo, interface) e os quadros acima de 25 ms.

## Licenças dos assets

Cinzel e Pixelify Sans: SIL Open Font License (`assets/fonts/OFL-*.txt`). `DejaVuSans-fallback.ttf` é um
subconjunto da DejaVu Sans (licença livre da Bitstream Vera), usado para os poucos símbolos que as outras
fontes não têm (→, ☰). Os ícones são da Noto Color Emoji (OFL). Os efeitos vêm do pixelfx (MIT,
ver `vendor/pixelfx/NOTICE.md`).
