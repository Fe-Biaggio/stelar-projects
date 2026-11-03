# Pendências do Furball

Lista do que foi pedido e ainda não está pronto (ou falta testar). Atualizada a cada commit.

## Pendente

- [ ] Multiplayer pelo 4G: servidor de retransmissão (TURN, ex. Cloudflare) se alguma rede não
      conectar.
- [ ] Testar o multiplayer em aparelhos de verdade (celular + PC + Retroid).

## Pendente para a versão final

- [ ] Tirar o botão "Recomeçar (teste)" do multiplayer.

## Feito em 03/11/2026 (rachaduras, testes com bots)

- [x] Rachadura no chão: xixi, cavar e achar um item.
- [x] Gato nunca entra numa sala em cima de pedra, buraco ou fogueira (acontecia em ~4% das
      entradas com outro gato na porta).
- [x] Bots desviam dos obstáculos, saem de salas que vão sumir e contornam pedras para atirar.
- [x] Só o anfitrião volta para a sala de espera no fim; botão "Recomeçar (teste)".
- [x] Simulador de partidas VS com bots (`furballDev.simMany`); mapas conferidos: 2.160
      tabuleiros de 1x1 a 12x12, todas as etapas do encolhimento sem sala isolada.

## Feito em 03/11/2026 (bots, placar, alcance)

- [x] Sons de acerto e morte de inimigo mais suaves.
- [x] Bola de pelo comum apaga a fogueira em 3 acertos (a chama diminui); queimadura 0,2/s.
- [x] Bots no multiplayer (ocupam uma vaga, gato livre aleatório).
- [x] VS: nome embaixo dos gatos, placar no fim, quem cai assiste os outros, qualquer jogador
      leva todos de volta para a sala de espera.
- [x] Status de alcance (bola de pelo voa um pouco menos no começo) e item Estilingue (+0,2x).

## Feito em 03/11/2026 (elementos)

- [x] Modo dev: 2 salas à direita da sala do baú com todos os itens para teste.
- [x] Fogueiras nas salas (queimam ao encostar; bomba ou bola molhada/congelada apaga).
- [x] Itens pimenta (fogo), cubo de gelo (congela), catavento (vento) e pedra (areia);
      fogo + gelo = água (lentidão); os outros se combinam.

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
