# Furball

Roguelike de ação top-down com gatos, inspirado no gênero de *The Binding of Isaac*:
salas fechadas, tiro em 8 direções, itens que acumulam efeitos e andares gerados
proceduralmente que sempre terminam em um boss ou desafio.

## Tecnologia

**Phaser 3 + TypeScript + Vite.** Roda no navegador; depois pode ser empacotado para
desktop (Steam) com Electron ou Tauri.

## Como rodar

```bash
npm install
npm run dev
```

Abra o endereço que aparecer (normalmente http://localhost:5173).
O jogo abre na seleção de personagem: Preto (principal), Laranja, Siamês, Tricolor ou Frajola.

Controles: **WASD** para andar, **setas** para cuspir bolas de pelo. Depois de perder,
**R** recomeça e **Esc** volta à seleção. Adicione `?debug` na URL para ver as colisões.

O gato começa com 3 corações; os espinhos no chão tiram vida. No meio da sala há um gato
cinza de teste: ele morre com 4 bolas de pelo e reaparece depois de alguns segundos.

## Estrutura

```
Furball/
├── art/references/      # folhas de sprites conceituais (fonte de inspiração)
├── public/assets/       # sprites prontos usados pelo jogo
├── src/
│   ├── config.ts        # medidas da sala e da tela
│   ├── main.ts          # inicia o Phaser
│   ├── cats.ts          # lista de gatos jogáveis e posição da boca de cada um
│   ├── objects/         # jogador, inimigos, projéteis...
│   ├── scenes/          # carregamento, seleção de personagem, sala
│   └── world/           # desenho da sala
└── tools/               # scripts para recortar sprites das folhas
```

Para regerar os sprites a partir das folhas: `python tools/extract_cats.py` e
`python tools/extract_ui.py`.

## Núcleo do jogo (MVP)

1. **Jogador** – gato com movimento WASD e tiro nas setas (bolhas/bolas de pelo).
2. **Sala** – grade fixa (ex.: 13×7 tiles), portas que travam até limpar os inimigos.
3. **Gerador de andar** – grade de salas montada por expansão aleatória a partir da sala
   inicial; salas especiais (tesouro, loja, boss) colocadas nas pontas sem saída.
   O boss fica sempre na sala mais distante do início.
4. **Inimigos** – moscas, aranhas, slimes, cabeças; IA simples (perseguir, vagar, atirar).
5. **Itens** – coletáveis (moedas, bombas, chaves, corações) e itens passivos que alteram
   atributos (dano, velocidade, cadência, tipo de projétil).
6. **HUD** – corações, contadores, minimapa.
7. **Progressão** – derrotar o boss abre o alçapão para o próximo andar (novo mapa gerado).

## Referências de arte

Ver `art/references/`. As folhas contêm personagens gatos (várias pelagens e animações),
itens, inimigos, tiles de chão/parede, salas de exemplo por bioma (porão, sangue,
biblioteca, gelo, inferno), HUD e minimapa.
