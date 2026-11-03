import Phaser from 'phaser';
import { FLOOR, GAME_HEIGHT, GAME_WIDTH, WALL } from '../config';

/** Desenha uma sala de porão: paredes de pedra, chão de tábuas e quatro portas. */
export type DoorSide = 'up' | 'down' | 'left' | 'right';

/** Desenha a sala. As portas em `openDoors` aparecem abertas (passagem escura); as outras, fechadas. */
export function drawRoom(scene: Phaser.Scene, openDoors: DoorSide[] = []) {
  const rng = new Phaser.Math.RandomDataGenerator(['furball']);
  const g = scene.add.graphics().setDepth(-100);
  const shade = (base: number, spread: number) => {
    const c = Phaser.Display.Color.IntegerToColor(base);
    const d = rng.between(-spread, spread);
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Clamp(c.red + d, 0, 255),
      Phaser.Math.Clamp(c.green + d, 0, 255),
      Phaser.Math.Clamp(c.blue + d, 0, 255),
    );
  };

  // Paredes: tijolos de pedra cobrindo a tela inteira (o chão é desenhado por cima).
  g.fillStyle(0x1b1614).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  const bw = 40;
  const bh = 22;
  for (let row = 0; row * bh < GAME_HEIGHT; row++) {
    const offset = row % 2 ? bw / 2 : 0;
    for (let x = -offset; x < GAME_WIDTH; x += bw) {
      g.fillStyle(shade(0x463d38, 10)).fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
      g.fillStyle(0x5a4f49, 0.5).fillRect(x + 2, row * bh + 2, bw - 4, 3);
    }
  }

  // Sombra das paredes escurecendo em direção ao chão (dá profundidade).
  for (let i = 0; i < 6; i++) {
    const inset = WALL - 6 - i * 8;
    g.lineStyle(8, 0x000000, 0.08 + i * 0.05);
    g.strokeRect(inset + 4, inset + 4, GAME_WIDTH - (inset + 4) * 2, GAME_HEIGHT - (inset + 4) * 2);
  }

  // Chão: tábuas horizontais de madeira.
  const plankH = 32;
  for (let y = FLOOR.y; y < FLOOR.y + FLOOR.height; y += plankH) {
    let x = FLOOR.x - rng.between(0, 120);
    while (x < FLOOR.x + FLOOR.width) {
      const len = rng.between(110, 230);
      const x0 = Math.max(x, FLOOR.x);
      const x1 = Math.min(x + len, FLOOR.x + FLOOR.width);
      g.fillStyle(shade(0x6e4b33, 9)).fillRect(x0, y, x1 - x0, plankH);
      g.fillStyle(0x8a6244, 0.35).fillRect(x0, y + 2, x1 - x0, 2);
      // Veios da madeira
      for (let v = 0; v < 2; v++) {
        const vy = y + rng.between(8, plankH - 6);
        const vx = rng.between(x0, Math.max(x0, x1 - 40));
        g.fillStyle(0x4f3423, 0.4).fillRect(vx, vy, rng.between(20, 60), 2);
      }
      g.fillStyle(0x3a2619).fillRect(x1 - 2, y, 2, plankH); // junta entre tábuas
      x += len;
    }
    g.fillStyle(0x34221a).fillRect(FLOOR.x, y + plankH - 2, FLOOR.width, 2);
  }

  // Manchas e sujeira espalhadas
  for (let i = 0; i < 10; i++) {
    g.fillStyle(0x2a1a12, rng.realInRange(0.08, 0.18));
    g.fillEllipse(
      rng.between(FLOOR.x + 40, FLOOR.x + FLOOR.width - 40),
      rng.between(FLOOR.y + 30, FLOOR.y + FLOOR.height - 30),
      rng.between(30, 90),
      rng.between(14, 40),
    );
  }

  // Sombra que as paredes projetam no chão (mais forte em cima).
  for (let i = 0; i < 5; i++) {
    g.fillStyle(0x000000, 0.12 - i * 0.02);
    g.fillRect(FLOOR.x, FLOOR.y, FLOOR.width, 28 - i * 5);
    g.fillRect(FLOOR.x, FLOOR.y, 18 - i * 3, FLOOR.height);
    g.fillRect(FLOOR.x + FLOOR.width - (18 - i * 3), FLOOR.y, 18 - i * 3, FLOOR.height);
    g.fillRect(FLOOR.x, FLOOR.y + FLOOR.height - (12 - i * 2), FLOOR.width, 12 - i * 2);
  }
  g.lineStyle(3, 0x120e0c).strokeRect(FLOOR.x, FLOOR.y, FLOOR.width, FLOOR.height);

  // Portas no meio de cada parede.
  for (const side of Object.keys(DOOR_POS) as DoorSide[]) drawDoor(g, side, openDoors.includes(side));
}

/** Centro e rotação de cada porta (o desenho base é a porta de cima). */
export const DOOR_POS: Record<DoorSide, { x: number; y: number; rotation: number }> = {
  up: { x: GAME_WIDTH / 2, y: WALL / 2, rotation: 0 },
  down: { x: GAME_WIDTH / 2, y: GAME_HEIGHT - WALL / 2, rotation: Math.PI },
  left: { x: WALL / 2, y: GAME_HEIGHT / 2, rotation: -Math.PI / 2 },
  right: { x: GAME_WIDTH - WALL / 2, y: GAME_HEIGHT / 2, rotation: Math.PI / 2 },
};

/** Converte pontos da porta "de cima" para a posição/rotação da porta `side`. */
function doorPoints(side: DoorSide) {
  const { x, y, rotation } = DOOR_POS[side];
  return (list: number[][]) =>
    list.map(([px, py]) => {
      const p = new Phaser.Math.Vector2(px, py).rotate(rotation);
      return new Phaser.Math.Vector2(x + p.x, y + p.y);
    });
}

const OPENING = [[-34, 32], [-34, -10], [-24, -16], [24, -16], [34, -10], [34, 32]];

function drawDoor(g: Phaser.GameObjects.Graphics, side: DoorSide, open: boolean) {
  const pts = doorPoints(side);

  g.fillStyle(0x5c514b).fillPoints(pts([[-56, 32], [-56, -18], [-40, -32], [40, -32], [56, -18], [56, 32]]), true);
  g.fillStyle(0x2c2522).fillPoints(pts([[-42, 32], [-42, -14], [-30, -22], [30, -22], [42, -14], [42, 32]]), true);
  const opening = OPENING;
  if (open) {
    // Passagem escura com o chão de madeira entrando um pouco
    g.fillStyle(0x0a0807).fillPoints(pts(opening), true);
    g.fillStyle(0x5a3d2a).fillPoints(pts([[-34, 32], [-34, 22], [34, 22], [34, 32]]), true);
    g.fillStyle(0x000000, 0.4).fillPoints(pts([[-34, 22], [-34, 16], [34, 16], [34, 22]]), true);
  } else {
    // Porta de madeira fechada, com tábuas e uma faixa de ferro
    g.fillStyle(0x5a3a24).fillPoints(pts(opening), true);
    g.lineStyle(2, 0x2e1c12);
    for (const px of [-17, 0, 17]) {
      const [a, b] = pts([[px, -14], [px, 32]]);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    g.fillStyle(0x3a3634).fillPoints(pts([[-34, 6], [-34, 0], [34, 0], [34, 6]]), true);
    g.lineStyle(2, 0x1a1410).strokePoints(pts(opening), true);
  }
  g.lineStyle(3, 0x171210).strokePoints(pts([[-56, 32], [-56, -18], [-40, -32], [40, -32], [56, -18], [56, 32]]), false);
}

/**
 * Porta trancada desenhada por cima da passagem: madeira com faixas de ferro e um cadeado
 * dourado com buraco de fechadura. Ao destrancar, este desenho é removido.
 */
export function drawLockedDoor(scene: Phaser.Scene, side: DoorSide) {
  const g = scene.add.graphics().setDepth(-90);
  const pts = doorPoints(side);
  g.fillStyle(0x4a2e1c).fillPoints(pts(OPENING), true);
  g.lineStyle(2, 0x2a190f);
  for (const px of [-17, 0, 17]) {
    const [a, b] = pts([[px, -14], [px, 32]]);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  g.fillStyle(0x2e2a28).fillPoints(pts([[-34, -2], [-34, -8], [34, -8], [34, -2]]), true);
  g.fillStyle(0x2e2a28).fillPoints(pts([[-34, 22], [-34, 16], [34, 16], [34, 22]]), true);
  g.lineStyle(2, 0x140c08).strokePoints(pts(OPENING), true);

  // Cadeado no meio da porta
  const [c] = pts([[0, 8]]);
  g.lineStyle(4, 0x9a9490).strokeCircle(c.x, c.y - 9, 7);
  g.fillStyle(0x1a120c).fillRoundedRect(c.x - 13, c.y - 7, 26, 22, 5);
  g.fillStyle(0xe2b13c).fillRoundedRect(c.x - 11, c.y - 5, 22, 18, 4);
  g.fillStyle(0xffe08a).fillRect(c.x - 9, c.y - 3, 4, 12);
  g.fillStyle(0x1a120c).fillCircle(c.x, c.y + 2, 3);
  g.fillTriangle(c.x - 2, c.y + 3, c.x + 2, c.y + 3, c.x, c.y + 10);
  return g;
}

/** Grade de ferro que fecha uma porta aberta enquanto há inimigos na sala. */
export function drawDoorBars(scene: Phaser.Scene, side: DoorSide) {
  const g = scene.add.graphics().setDepth(-89);
  const pts = doorPoints(side);
  g.fillStyle(0x000000, 0.35).fillPoints(pts(OPENING), true);
  for (const px of [-24, -12, 0, 12, 24]) {
    const [a, b] = pts([[px, -12], [px, 32]]);
    g.lineStyle(5, 0x1a1614).lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(2, 0x8a847e).lineBetween(a.x - 1, a.y, b.x - 1, b.y);
  }
  for (const py of [0, 20]) {
    const [a, b] = pts([[-34, py], [34, py]]);
    g.lineStyle(5, 0x1a1614).lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(2, 0x6a645e).lineBetween(a.x, a.y - 1, b.x, b.y - 1);
  }
  return g;
}

/** Alçapão no chão que leva ao próximo nível. */
export function drawTrapdoor(scene: Phaser.Scene, x: number, y: number) {
  const g = scene.add.graphics().setDepth(-55);
  g.fillStyle(0x000000, 0.35).fillRoundedRect(x - 40, y - 26, 84, 58, 8);
  g.fillStyle(0x3a2616).fillRoundedRect(x - 42, y - 30, 84, 58, 8);
  g.fillStyle(0x050302).fillRoundedRect(x - 34, y - 22, 68, 42, 6);
  g.fillStyle(0x1a110a).fillRect(x - 30, y - 18, 60, 8);
  g.lineStyle(3, 0x1a0f08).strokeRoundedRect(x - 42, y - 30, 84, 58, 8);
  // Degraus descendo
  g.fillStyle(0x2a1a10).fillRect(x - 26, y - 6, 52, 5).fillRect(x - 22, y + 4, 44, 4);
  return g;
}
