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

Controles: **WASD** para andar, **setas** para cuspir bolas de pelo. O botão **Início**
(canto superior direito) ou **Esc** volta à seleção a qualquer momento. Depois de perder,
**R** recomeça com o mesmo gato. Adicione `?debug` na URL para ver as colisões.

O gato começa com 3 corações; os espinhos no chão tiram vida. No meio da sala há um gato
cinza de teste: ele morre com 4 bolas de pelo e reaparece depois de alguns segundos.

### Itens

Cada item soma **+0,2x** no status (todos começam em 1x). O painel pequeno no canto
superior direito mostra os valores atuais.

| Item | Efeito | Raridade |
|---|---|---|
| Comida enlatada | +1 coração (e cura esse coração) | Raro |
| Catnip | Velocidade de movimento | Comum |
| Escovinha | Cadência (tiros por segundo) | Incomum |
| Churu | Sorte | Comum |
| Bolinha de lã | Velocidade do tiro | Comum |
| Peixe fresco | Dano | Épico |
| Leitinho | Tamanho da bola de pelo | Incomum |

Na sala de teste há um de cada no chão; R ou Esc recomeçam com os status zerados.

Botões de teste no topo da sala:
- **Dano: ligado/desligado** – mostra o dano de cada bola de pelo sobre o inimigo.
- **+ Repor itens** – devolve ao chão os itens já pegos, para testar o acúmulo.

### Sala do tesouro e sorte

A porta da direita da sala inicial leva à sala do tesouro, com um baú no meio. Encostar no
baú o abre e sorteia um item pela raridade:

| Sorte | Comum | Incomum | Raro | Épico |
|---|---|---|---|---|
| 1x (início) | 50% | 30% | 15% | 5% |
| 2x | 10% | 30% | 42,5% | 17,5% |
| 2,4x | 0% | 24% | 53,5% | 22,5% |
| 3x ou mais | 0% | 0% | 70% | 30% |

A sorte tira chance primeiro do comum e, quando ele zera, do incomum; essa chance vai para
raro e épico. O painel de status mostra as chances atuais. Na sala do tesouro, o botão
**+ Novo baú** fecha o baú de novo para testar várias aberturas. As salas guardam o que ficou
nelas (baú aberto, itens no chão) quando o gato sai e volta.

## Estrutura

```
Furball/
├── art/references/      # folhas de sprites conceituais (fonte de inspiração)
├── public/assets/       # sprites prontos usados pelo jogo
├── src/
│   ├── config.ts        # medidas da sala e da tela
│   ├── main.ts          # inicia o Phaser
│   ├── cats.ts          # lista de gatos jogáveis e posição da boca de cada um
│   ├── items.ts         # itens coletáveis, efeitos e raridade
│   ├── rarity.ts        # raridades e chances do baú conforme a sorte
│   ├── run.ts           # estado da partida (status, vida, o que ficou em cada sala)
│   ├── stats.ts         # status do gato (multiplicadores)
│   ├── objects/         # jogador, inimigos, projéteis...
│   ├── scenes/          # carregamento, seleção de personagem, sala
│   └── world/           # desenho da sala
└── tools/               # scripts para recortar sprites das folhas
```

Para regerar os sprites a partir das folhas: `python tools/extract_cats.py`,
`python tools/extract_ui.py` e `python tools/extract_items.py`.

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
