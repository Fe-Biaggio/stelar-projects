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
O jogo abre numa tela com dois modos e depois na seleção de personagem (Preto, o principal,
Laranja, Siamês, Tricolor ou Frajola):

- **Modo desenvolvedor** – a sala de testes: todos os itens e coletáveis no chão, gato de
  teste, painel de status e chances do baú, números de dano e botões para repor itens.
- **Jogar** – o jogo para valer: cada nível é um mapa gerado aleatoriamente (9 salas no
  nível 1, mais 2 a cada nível, até 15), com salas de inimigos, tesouro, loja trancada e o boss
  na sala mais distante. Ao entrar numa sala com inimigos, as portas fecham até você vencer;
  cada sala limpa pode soltar moeda, coração, chave ou bomba. O minimapa no canto mostra as
  salas visitadas e os ícones de tesouro (amarelo), loja (verde) e boss (vermelho). Derrotar
  o boss deixa um item, um coração e um alçapão para o próximo nível (mapa novo; a chave
  dourada é perdida). Começa com 1 bomba e 1 chave.

São **5 níveis**; vencer o boss do nível 5 termina o jogo com vitória. A cada nível aparece
um inimigo a mais por sala (até 8) e o dano dos inimigos cresce 0,5x (1x, 1,5x, 2x, 2,5x, 3x),
sempre arredondado para baixo em meios corações: 1x e 1,5x tiram meio coração, 2x e 2,5x tiram
um coração, 3x tira um e meio. Depois de levar dano, o gato fica 1 segundo invulnerável.

Inimigos: mosca (voa em sua direção), aranha (pulos rápidos), bolota vermelha (atira nas 4
direções) e cabeça pálida (persegue). Bosses, um por nível (com metade da vida atacam mais
rápido):

| Nível | Boss | Ataques |
|---|---|---|
| 1 | Morcegão | anel de 8 tiros, investida |
| 2 | Ratazana | rápida, leque de 3 tiros mirados, 3 investidas seguidas |
| 3 | Cachorrão | anel de 10 tiros, 2 investidas seguidas |
| 4 | Gavião | voa, leque de 5 tiros mirados, mergulho |
| 5 | O Humano | lento, pisão com anel de 16 tiros, leque de 3 tiros |

O morcego vem da folha 3; rato, cachorro, pássaro e humano foram desenhados por
`tools/draw_bosses.py` (troque os PNGs em `public/assets/boss_*.png` por artes próprias).

Controles: **WASD** para andar, **setas** para cuspir bolas de pelo, **E** para colocar bomba,
**Espaço** (ou **Q**) para usar o item usável, **M** (ou **Tab**) para ampliar/reduzir o mapa
(no celular, toque no mapa). O botão **Início**
(canto superior direito) ou **Esc** volta à seleção a qualquer momento. Depois de perder,
**R** recomeça com o mesmo gato. Adicione `?debug` na URL para ver as colisões.

O gato começa com 3 corações. Cada coração vale 2 pontos de vida e o dano padrão é 1, então
cada acerto (ou espinho) tira meio coração. No meio da sala há um gato
cinza de teste: ele morre com 4 bolas de pelo e reaparece depois de alguns segundos.

### Itens

Cada item soma **+0,2x** no status (todos começam em 1x). O painel pequeno no canto
superior direito mostra os valores atuais.

| Item | Efeito | Raridade |
|---|---|---|
| Comida enlatada | +1 coração (já vem cheio) | Raro |
| Catnip | Velocidade de movimento | Comum |
| Escovinha | Cadência (tiros por segundo) | Incomum |
| Churu | Sorte | Comum |
| Bolinha de lã | Velocidade do tiro | Comum |
| Peixe fresco | Dano | Épico |
| Leitinho | Tamanho da bola de pelo | Incomum |
| Estilingue | Alcance (distância que a bola de pelo voa) | Comum |

Na sala de teste há um de cada no chão; R ou Esc recomeçam com os status zerados.

### Moedas, bombas e chaves

Coletáveis de inventário, contados embaixo dos corações (até 99 cada):

- **Moeda**, **bomba** e **chave prateada** – cada uma soma 1 no contador.
- **Chave dourada** – fica por cima do ícone da chave prateada no contador. Enquanto você a
  tiver, portas e baús abrem sem gastar chaves. Ela só vale no nível atual: ao derrotar o
  boss e ir para o próximo mapa, ela é perdida (`startNextLevel` em `src/run.ts`).

Na sala inicial há duas moedas, uma bomba, uma chave e uma chave dourada para teste.

### Portas trancadas, baú e loja

- A **porta de cima** da sala inicial tem cadeado: empurrá-la gasta 1 chave prateada (ou
  nenhuma, com a chave dourada). Depois de aberta, fica aberta.
- O **baú** da sala do tesouro também gasta 1 chave para abrir.
- Atrás da porta trancada fica a **loja**: um gato vendedor atrás de uma bancada e 3 itens
  sorteados (a sorte ajuda) com preço em moedas pela raridade — comum 3, incomum 5, raro 8,
  épico 12. Passe por cima do item para comprar; sem moedas suficientes, o vendedor avisa
  quanto falta. O botão **+ Repor loja** sorteia itens novos para os espaços vazios.

### Corações

- **Coração** (2 pontos) e **meio coração** (1 ponto) no chão recuperam vida. Com a vida
  cheia, eles ficam no chão.
- **Coração azul escuro** funciona como escudo: aparece depois dos vermelhos, é perdido
  antes deles e não se recupera.

### Bombas

- **E** coloca uma bomba (se houver no contador). Ela pisca cada vez mais rápido e explode
  em 2,5 segundos.
- O gato empurra a bomba andando contra ela; ela quica nas paredes.
- A explosão tira 1 coração do gato se ele estiver perto, dá 10 de dano no inimigo, abre o
  baú, faz outras bombas próximas explodirem e deixa uma marca de queimado no chão.
- Itens, moedas e corações por perto são lançados para longe: quanto mais perto da bomba,
  mais longe vão.

Botões de teste no topo da sala:
- **Dano: ligado/desligado** – mostra o dano de cada bola de pelo sobre o inimigo.
- **+ Repor itens** – devolve ao chão os itens e coletáveis já pegos, para testar o acúmulo.

### Sala do tesouro e sorte

A porta da direita da sala inicial leva à sala do tesouro, com um baú no meio. Encostar no
baú o abre e sorteia um item pela raridade:

| Sorte | Comum | Incomum | Raro | Épico |
|---|---|---|---|---|
| 1x (início) | 50% | 30% | 15% | 5% |
| 1,4x | 30% | 42% | 21% | 7% |
| 1,8x | 10% | 54% | 27% | 9% |
| 2x | 10% | 50% | 30% | 10% |
| 3x | 10% | 30% | 45% | 15% |
| 4x | 10% | 10% | 60% | 20% |
| 8x | 10% | 10% | 40% | 40% |
| 14x ou mais | 10% | 10% | 10% | 70% |

A sorte multiplica as chances de épico, raro e incomum (sorte 2x = épico 10%), e o comum fica
com o resto. Nenhuma raridade cai abaixo de 10%: quando o comum chega a 10%, o incomum passa
a cair; quando o incomum chega a 10%, o raro passa a cair, até o épico chegar a 70%.
O painel de status mostra as chances atuais. Na sala do tesouro, o botão
**+ Novo baú** fecha o baú de novo para testar várias aberturas. As salas guardam o que ficou
nelas (baú aberto, itens no chão) quando o gato sai e volta.

### Salas: pedras, buracos e móveis

As salas comuns sorteiam elementos numa grade de 13x7 (sempre deixando as portas e o centro
livres e todo o chão conectado):

- **Pedra** – bloqueia o gato, os inimigos de chão e as bolas de pelo. Uma bomba por perto quebra.
- **Buraco** – o gato e os inimigos de chão não atravessam (sem cair); quem voa passa por cima.
- **Cadeira** – o gato sobe nela; inimigos de chão desviam.
- **Mesa** – só dá para subir vindo de uma cadeira. Em cima da mesa, só inimigos que voam (e os
  tiros deles) alcançam o gato; o acerto de um deles pode derrubá-lo da mesa. Andar para fora
  da mesa desce sem dano.
- A bomba destrói pedra, cadeira e mesa: viram destroços no chão e dá para passar por cima
  (eles não são empurrados, ao contrário dos itens).

### Baús, drops e bombas

- Cada nível tem pelo menos 2 salas comuns com um item de graça no meio e 2 salas comuns com baú (3 a partir do nível 3). O **baú de madeira**
  abre sem chave e solta 2 ou 3 coletáveis (10% de chance de um item); o **dourado** precisa de
  chave e dá um item pela raridade.
- Uma bomba abre qualquer baú; no dourado, as chances de item bom caem (até a metade).
- Uma bomba numa **porta trancada** tem 50% de abrir na hora; se não abrir, a porta racha e a
  próxima bomba abre com certeza.
- Inimigos soltam algo ao morrer: moeda 50%, chave 5%, bomba 5%, item 5%.

### Gatinhos pedinte e vampiro

Cada um tem 30% de chance de aparecer em cada nível (no máximo um de cada por nível; os dois
podem aparecer juntos), numa sala sem inimigos.

- **Gatinho pedinte** – encostar entrega 1 moeda; cada moeda tem 20% de chance de virar um item
  (raridade pelas chances do baú). Depois de dar 2 itens, ele vai embora.
- **Gatinho vampiro** – encostar doa 1 ponto de vida (meio coração; nunca deixa o gato com
  menos de meio coração); cada doação tem 30% de chance de virar um item. Depois de dar 2
  itens, ele vai embora.
- **Capa de vampiro + 2 dentinhos** – quem doar 3 corações no total durante a partida e ficar
  com meio coração ganha esse item escondido: dano +1x.

A porta que leva à sala do boss tem moldura vermelha, caveira e chifres.

### Itens usáveis

Um por vez (pegar outro troca, e o antigo fica no chão). Use com Espaço/Q ou o botão na tela;
depois recarregam. O slot fica embaixo das chaves, com a barra de recarga.

| Item | Efeito | Recarga |
|---|---|---|
| Coleira | imortal por 5 s | 30 s |
| Patinha | dano 2x por 5 s | 20 s |

### Salas de teste (modo desenvolvedor)

A partir da sala de testes: **direita** tesouro (baú dourado), **cima** loja (trancada; dá
para abrir com chave ou bomba), **esquerda** sala de obstáculos (mesa, cadeiras, pedras,
buracos, baú de madeira, uma mosca, uma cabeça pálida e 3 bombas) e **baixo** sala dos itens
usáveis (coleira, patinha, gato de teste e espinhos). Ao lado da sala dos itens usáveis ficam
o **gatinho pedinte** (esquerda, com 6 moedas) e o **gatinho vampiro** (direita, com 6 corações). O botão **+ Repor** de cada sala põe
tudo de volta.

### Itens elementais e fogueiras

Quatro itens mudam a bola de pelo (e se combinam):

| Item | Bola | No inimigo |
|---|---|---|
| Pimenta | pegando fogo | pega fogo: perde 0,2 de vida por segundo, por 3 s |
| Cubo de gelo | congelada | para por 1 s (o boss, um instantinho) |
| Catavento de mão | de vento | é empurrado 3x mais longe |
| Pedra | cheia de areia | fica lento por 3 s |
| Pimenta + gelo | molhada (água) | fica lento por 3 s |

Fogueiras aparecem nas salas como pedras e buracos (mesmo tamanho): bloqueiam a passagem e
encostar tira meio coração. A bomba apaga a fogueira, e uma bola congelada ou molhada também;
a bola de pelo comum apaga com 3 acertos (a chama diminui a cada um).
Sprites desenhados por `tools/draw_elements.py`.

No modo desenvolvedor, à direita da sala do baú há duas salas com todos os itens do jogo
(passivos; usáveis e elementais), com o nome embaixo de cada um e o botão "+ Repor itens".

### Controle (gamepad)

Funciona com controles no navegador (Xbox, Android, Retroid Pocket etc.): analógico esquerdo
ou direcional anda; analógico direito mira e atira. Botões de ação: **A** atira para onde o
gato olha, **B** bomba, **X** item usável, **Y** amplia/reduz o mapa. Segunda opção: **L1**
atira, **R1** bomba, **L2** item, **R2** mapa. Start volta ao início. Nos menus: direcional e
A (B volta). Ao usar o controle, os botões de toque somem.

### Sons

Todos os efeitos são gerados na hora pela biblioteca [ZzFX](https://github.com/KilledByAPixel/ZzFX)
(sem arquivos de áudio): tiro, acerto, inimigo morrendo, dano, moeda, item, bomba, porta,
baú, alarme do VS, vitória e derrota. Para ajustar um som, mude os números em `src/audio/sfx.ts`.

### Multiplayer

Na tela inicial, **Multiplayer**: criar sala (pública ou privada), entrar numa sala pública
(lista com até 10 salas) ou entrar com o código de 5 letras de uma sala privada. Na sala de
espera cada jogador escolhe o nome e o gato (não pode repetir) e vê o ping de todos; quem
hospeda começa quando todos estiverem prontos.

- **Co-op (2 jogadores):** sem fogo amigo; os dois nascem juntos e enfrentam os 5 níveis.
  Mapa 25% maior e 2x mais inimigos. Moedas, bombas e chaves são divididas. Itens
  compartilhados (valem para os dois) ou individuais (1,5x mais itens e drops), escolha de
  quem hospeda. Quem cai volta com meio coração quando o outro limpa uma sala; se os dois
  caírem, fim de jogo. Passar por uma porta leva os dois.
- **VS (até 4 jogadores):** tabuleiro de salas (largura e altura de 1 a 12; recomendado 12x12
  para 4, 10x10 para 3, 8x8 para 2), quase todo preenchido, com salas de item (12 num 12x12)
  e de boss (5), proporcionais ao tamanho (nenhuma com 9 salas ou menos, ou com um lado de 2 ou
  menos, como 2x8). Cada gato nasce numa sala aleatória. O mapa grande abre
  no começo mostrando sua posição, as salas de item e de boss; cada um descobre as salas
  sozinho. As bolas de pelo machucam os outros gatos. Aos 5 minutos somem as pontas do lado
  maior (12x12 vira 10x10; 12x4 vira 10x4) e depois, a cada 2 minutos, mais uma linha ou
  coluna, até sobrar a sala do centro. 10 segundos antes toca o alarme e as salas condenadas
  avisam; quem ficar nelas cai. No 2x2, o mapa marca a sala que vai sobrar. A lista na lateral
  mostra os gatos vivos (quem caiu fica apagado e deitado). O último vivo vence. O nome de
  cada jogador aparece embaixo do gato. Quem cai assiste os outros (bomba ou item troca de
  gato). No fim, o placar mostra criaturas e bosses derrotados, itens passivos pegos e a
  pontuação (criatura 10, item 50, boss 200): o vencedor fica sempre em 1º, os outros pela
  pontuação, e a estrela marca a maior. Qualquer jogador (R, A ou toque) leva todos de volta
  para a sala de espera.
- **Bots:** na sala de espera, quem hospeda pode adicionar bots no lugar de jogadores (co-op ou
  VS). O bot pega um gato livre aleatório e joga sozinho: mira alinhando com o alvo, segue o
  parceiro no co-op e anda rumo ao centro no VS.

Como funciona: conexão direta entre os aparelhos (WebRTC com [PeerJS](https://peerjs.com/);
o servidor gratuito do PeerJS só apresenta os aparelhos). Quem hospeda roda o jogo inteiro e
manda a imagem da sala para os outros (`src/net/mirror.ts`), que mandam de volta os comandos.
Algumas redes 4G muito fechadas podem não conectar (precisaria de um servidor de retransmissão).

### Jogar no celular

Em telas de toque aparecem controles na tela: analógico na metade esquerda (nasce onde o
dedo encosta) para andar, 4 botões de tiro em losango à direita, o botão de bomba e, acima
dele, o botão do item usável (quando você tem um). Na
seleção, o primeiro toque escolhe o gato e o segundo começa. Com o celular em pé, a página
pede para girar.

Versão pública (qualquer navegador, atualiza sozinha a cada push no `main` pelo GitHub
Actions): https://fe-biaggio.github.io/stelar-projects/

Versão no Artifact: https://claude.ai/artifact/6K96NXayqtfjv1uhSQq6Mp
(privada; o multiplayer pode não funcionar lá). Para atualizar: `npm run build`, `python tools/artifact_page.py` e publicar de novo
`dist/furball.html` com os arquivos de `dist/assets/`.

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
│   ├── pickups.ts       # moedas, bombas, chaves e corações do chão
│   ├── rarity.ts        # raridades e chances do baú conforme a sorte
│   ├── run.ts           # estado da partida (status, vida, nível, o que ficou em cada sala)
│   ├── shop.ts          # itens e preços da loja
│   ├── stats.ts         # status do gato (multiplicadores)
│   ├── audio/sfx.ts     # efeitos sonoros (ZzFX)
│   ├── net/             # multiplayer: conexão (peer.ts), espelho da sala (mirror.ts), sessão
│   ├── objects/         # jogador, inimigos, projéteis...
│   ├── scenes/          # telas, sala (RoomScene), multiplayer, sala de espera, VS (vsDirector)
│   ├── ui/              # HUD, mapa, menus, controle e controles de toque
│   └── world/           # mapa do nível (floor.ts), desenho da sala, explosão e empurrão
└── tools/               # scripts para recortar sprites das folhas
```

Em `npm run dev`, um POST em `/__screenshot` com `{ name, data }` (PNG em data URL) salva
um print do jogo em `screenshots/` (fora do git), para enviar capturas durante o desenvolvimento.

Para regerar os sprites a partir das folhas: `python tools/extract_cats.py`,
`python tools/extract_ui.py`, `python tools/extract_items.py`, `python tools/extract_pickups.py`
`python tools/extract_enemies.py`, `python tools/draw_bosses.py`, `python tools/draw_props.py`
`python tools/draw_actives.py` e `python tools/draw_elements.py`.

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
