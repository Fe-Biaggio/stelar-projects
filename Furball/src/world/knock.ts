import Phaser from 'phaser';
import { FLOOR } from '../config';

const MARGIN = 26; // distância mínima das paredes

/**
 * Lança algo que está no chão de (x, y) para (x + dx, y + dy), sem sair da sala,
 * com um pulo no ar. `onMove` recebe a posição no chão e a altura do pulo a cada quadro.
 */
export function knockAlong(
  scene: Phaser.Scene,
  x: number,
  y: number,
  dx: number,
  dy: number,
  onMove: (x: number, y: number, lift: number) => void,
  onDone: (x: number, y: number) => void,
) {
  const tx = Phaser.Math.Clamp(x + dx, FLOOR.x + MARGIN, FLOOR.x + FLOOR.width - MARGIN);
  const ty = Phaser.Math.Clamp(y + dy, FLOOR.y + MARGIN, FLOOR.y + FLOOR.height - 8);
  const dist = Math.hypot(tx - x, ty - y);
  const hop = Math.min(18 + dist * 0.25, 70);
  const state = { t: 0 };
  scene.tweens.add({
    targets: state,
    t: 1,
    duration: 260 + Math.min(dist, 300),
    ease: 'Quad.Out',
    onUpdate: () => {
      const t = state.t;
      onMove(Phaser.Math.Linear(x, tx, t), Phaser.Math.Linear(y, ty, t), Math.sin(t * Math.PI) * hop);
    },
    onComplete: () => onDone(tx, ty),
  });
}
