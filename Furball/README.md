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
Controles: **WASD** ou **setas** para mover. Adicione `?debug` na URL para ver as colisões.

## Estrutura

```
Furball/
├── art/references/      # folhas de sprites conceituais (fonte de inspiração)
├── public/assets/       # sprites prontos usados pelo jogo
├── src/
│   ├── config.ts        # medidas da sala e da tela
│   ├── main.ts          # inicia o Phaser
│   ├── objects/         # jogador, inimigos, projéteis...
│   └── scenes/          # cenas (sala, menus, HUD)
└── tools/               # scripts para recortar sprites das folhas
```

Para regerar o sprite do gato preto: `python tools/extract_black_cat.py`.

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
