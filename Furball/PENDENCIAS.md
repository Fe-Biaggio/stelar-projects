# Pendências do Furball

Lista do que foi pedido e ainda não está pronto (ou falta testar). Atualizada a cada commit.

## Em andamento

- [ ] **Itens usáveis (acionáveis)** – nova categoria, ativada por botão:
  - [ ] Coleira: gato imortal por 5 s.
  - [ ] Patinha: dano do gato 2x por 5 s.
  - [ ] Botão de usar no teclado (Espaço / Q) e no celular (acima do botão de bomba).
  - [ ] Slot do item usável no HUD com barra de recarga.
  - [x] Sprites (`tools/draw_actives.py` → `public/assets/actives.png`).
- [ ] **Salas fixas de teste no modo desenvolvedor** para tudo que foi criado:
  - [x] Sala de obstáculos (à esquerda da sala de testes): mesa, cadeiras, pedras, buracos,
        baú de madeira, uma mosca e uma cabeça pálida.
  - [ ] Bombas para testar na sala de obstáculos.
  - [ ] Sala dos itens usáveis (abaixo da sala de testes): coleira, patinha, gato de teste e espinhos.

## Falta testar no navegador

- [ ] Bomba abrindo baú dourado (chances piores, até a metade) e baú de madeira.
- [ ] Bomba em porta trancada: 50% abre; senão racha e a segunda bomba abre.
- [ ] Bomba destruindo pedra, cadeira e mesa (viram destroços; dá para passar por cima).
- [ ] Drops dos inimigos ao morrer (moeda 50%, chave/bomba 10%, item 5%).
- [ ] Salas comuns com baú no modo jogo (pelo menos 2 por nível).

## Depois

- [ ] Publicar a versão nova no link do celular (`npm run build`, `python tools/artifact_page.py`
      e publicar `dist/furball.html` com `dist/assets/`).
- [ ] Atualizar o README com obstáculos, baús, drops, bombas em portas/baús e itens usáveis.
