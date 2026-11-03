# Furball – guia para o Claude

Roguelike de gatos no estilo The Binding of Isaac. Phaser 3.90 + TypeScript + Vite. Todo o
texto do jogo, comentários e commits em **português do Brasil**. O usuário costuma acompanhar
pelo celular (Remote Control): mande prints com SendUserFile.

## Comandos

- `npm run dev` (pela raiz do repo: `.claude/launch.json` → preview "furball", porta 5173).
- `npx tsc --noEmit` para checar tipos. `npm run build` gera `dist/`.
- Versão do celular (Artifact privado, sempre o mesmo link
  https://claude.ai/artifact/6K96NXayqtfjv1uhSQq6Mp): `npm run build`, depois
  `python tools/artifact_page.py`, e publicar `dist/furball.html` com cada arquivo de
  `dist/assets/` em `files` (remover o `index-*.js` antigo com `null`).
- Commits: sempre em `main`, com push, mensagem "Furball: …". Atualize `PENDENCIAS.md` e o
  README a cada etapa. Não commite os notebooks nem `Aula 04/` (não são deste projeto).

## Arquitetura (src/)

- `scenes/`: Preload → Title (modo dev/jogo) → Select (gato) → Room. `RoomScene.ts` é a cena
  principal (grande): salas, combate, HUD, bombas, baús, loja, minimapa, botões de teste.
- `run.ts`: estado da partida (`Run`: modo, status, vida em pontos, inventário, item usável,
  nível, mapa, portas abertas/rachadas, estado de cada sala). Troca de sala = `scene.restart`
  com `{ run, room, enterFrom }`.
- `world/floor.ts`: gerador de mapa (grade de salas; boss na ponta mais distante; tesouro e loja
  trancada em pontas; baús em salas comuns) e o mapa fixo do modo dev.
- `world/props.ts`: pedras, buracos, cadeiras, mesas (grade 13x7) e o gerador que mantém tudo
  conectado. `world/room.ts`: desenho de sala/portas/grades/alçapão.
- `objects/`: Player (vida em pontos, 2 por coração; altura na cadeira/mesa; item usável),
  Furball (tiro), Enemy (+ EnemyShot e os 5 bosses em `BOSSES`), Bomb, Chest, ItemPickup,
  Pickup (moeda/bomba/chave/corações), Vendor, DummyCat.
- `items.ts` (passivos + usáveis), `rarity.ts` (chances pela sorte), `pickups.ts`, `shop.ts`,
  `stats.ts`, `cats.ts`, `ui/TouchControls.ts`.
- `tools/*.py` geram os PNGs de `public/assets/` a partir de `art/references/` (ou desenham).

## Testar sem gastar contexto

- Em dev, `window.furball` é o jogo. Use `mcp__Claude_Browser__javascript_tool` com scripts que
  façam tudo num só comando (o jogo continua rodando entre comandos: inimigos matam o gato
  parado). Dê `player.shield = 40` logo ao entrar numa sala.
- Prints: `fetch('/__screenshot', {method:'POST', body: JSON.stringify({name, data})})` com
  `g.renderer.snapshot` salva em `screenshots/` (fora do git). Leia só os prints necessários.
- Edições grandes: escreva um script Python em arquivo (scratchpad) e rode; heredocs com aspas
  no Bash costumam quebrar.
