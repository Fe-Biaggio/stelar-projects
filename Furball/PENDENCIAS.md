# Pendências do Furball

Lista do que foi pedido e ainda não está pronto (ou falta testar). Atualizada a cada commit.

## Pendente

- [ ] Modo dev: salas à direita da sala do baú com todos os itens disponíveis para teste.
- [ ] Fogueiras no mapa (como pedras e buracos, mesmo tamanho): encostar tira vida.
- [ ] 4 itens novos que mudam a bola de pelo: pimenta (fogo: inimigo pega fogo), cubo de gelo
      (congela: inimigo para um instante), catavento de mão (vento: mais empurrão), pedra
      (areia: deixa o inimigo lento). Fogo + gelo = água (molhado: lentidão). Os outros se
      combinam.
- [ ] Multiplayer pelo 4G: servidor de retransmissão (TURN, ex. Cloudflare) se alguma rede não
      conectar.
- [ ] Testar o multiplayer em aparelhos de verdade (celular + PC + Retroid).

## Feito em 03/11/2026 (multiplayer)

- [x] Modo multiplayer: criar sala pública/privada, lista de salas públicas (até 10), entrar
      com código, sala de espera com nome, gato sem repetir e ping.
- [x] Co-op (2 jogadores): mapa 25% maior, 2x inimigos, itens compartilhados ou individuais
      (1,5x itens e drops), quem cai volta quando o outro limpa a sala.
- [x] VS (até 4): tabuleiro configurável (até 12x12), salas de item e boss proporcionais,
      mapa grande no começo, PvP, encolhe aos 5 min e a cada 2 min com alarme, lista de vivos.
- [x] Botão de ampliar/reduzir o mapa em todos os modos (Y/R2, M/Tab, toque no mapa).
- [x] Controle: A atira, B bomba, X item, Y mapa; L1/R1/L2/R2 como segunda opção.
- [x] Sons em todos os modos (ZzFX).
- [x] GitHub Pages: https://fe-biaggio.github.io/stelar-projects/

## Feito em 03/11/2026

- [x] Corrigida a trava ao descer de nível.
- [x] 2 salas com item por nível; mais chaves nos drops.
- [x] Suporte a controle (gamepad).

- [x] Corrigida a trava ao pegar item no modo jogo (o painel de status só existe no modo dev).
- [x] Símbolo de boss (caveira com chifres) na porta da sala do boss.
- [x] Gatinho pedinte e gatinho vampiro (30% por nível cada, sala sem inimigos).
- [x] Capa de vampiro + 2 dentinhos (dano +1x).
- [x] Salas de teste no modo dev para os dois gatinhos.

## Ideias anotadas (não pedidas ainda)

- Trocar os bosses desenhados (rato, cachorro, pássaro, humano) e móveis por artes próprias.
- Balancear a vida dos bosses nos níveis altos (O Humano tem 144 de vida no nível 5).
- Mostrar no minimapa as salas dos gatinhos.
