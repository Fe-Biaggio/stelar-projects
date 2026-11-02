import Phaser from 'phaser';
import { FLOOR, GAME_HEIGHT, GAME_WIDTH, TILE, WALL } from '../config';
import { Player } from '../objects/Player';

type Keys = Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

export class RoomScene extends Phaser.Scene {
  private player!: Player;
  private keys!: Keys;
  private hint?: Phaser.GameObjects.Text;
  private readonly dir = new Phaser.Math.Vector2();

  constructor() {
    super('Room');
  }

  preload() {
    this.load.spritesheet('cat_black', 'assets/cat_black.png', { frameWidth: 80, frameHeight: 96 });
  }

  create() {
    this.drawRoom();

    this.physics.world.setBounds(FLOOR.x, FLOOR.y, FLOOR.width, FLOOR.height);
    this.player = new Player(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + TILE);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT,
      w: K.W, a: K.A, s: K.S, d: K.D,
    }) as Keys;

    this.hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - WALL - 28, 'WASD ou setas para mover', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e8d9c4',
        stroke: '#1a1210',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0.85)
      .setDepth(10_000);

    if (this.game.renderer.type === Phaser.WEBGL) {
      this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.3);
    }
  }

  update(time: number, deltaMs: number) {
    const k = this.keys;
    this.dir.set(
      (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
    );

    if (this.hint && this.dir.lengthSq() > 0) {
      const hint = this.hint;
      this.hint = undefined;
      this.tweens.add({ targets: hint, alpha: 0, duration: 800, delay: 1200, onComplete: () => hint.destroy() });
    }

    // Limita o passo para a física não dar saltos se a aba ficar em segundo plano.
    this.player.update(this.dir, Math.min(deltaMs, 50) / 1000, time);
  }

  /** Desenha uma sala de porão: paredes de pedra, chão de tábuas e quatro portas. */
  private drawRoom() {
    const rng = new Phaser.Math.RandomDataGenerator(['furball']);
    const g = this.add.graphics().setDepth(-100);
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

    // Portas (fechadas por enquanto) no meio de cada parede.
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.drawDoor(g, cx, WALL / 2, 0);
    this.drawDoor(g, cx, GAME_HEIGHT - WALL / 2, Math.PI);
    this.drawDoor(g, WALL / 2, cy, -Math.PI / 2);
    this.drawDoor(g, GAME_WIDTH - WALL / 2, cy, Math.PI / 2);
  }

  private drawDoor(g: Phaser.GameObjects.Graphics, x: number, y: number, rotation: number) {
    // Desenha uma porta voltada para cima e gira em torno do centro.
    const pts = (list: number[][]) =>
      list.map(([px, py]) => {
        const p = new Phaser.Math.Vector2(px, py).rotate(rotation);
        return new Phaser.Math.Vector2(x + p.x, y + p.y);
      });

    g.fillStyle(0x5c514b).fillPoints(pts([[-56, 32], [-56, -18], [-40, -32], [40, -32], [56, -18], [56, 32]]), true);
    g.fillStyle(0x2c2522).fillPoints(pts([[-42, 32], [-42, -14], [-30, -22], [30, -22], [42, -14], [42, 32]]), true);
    g.fillStyle(0x0a0807).fillPoints(pts([[-34, 32], [-34, -10], [-24, -16], [24, -16], [34, -10], [34, 32]]), true);
    g.lineStyle(3, 0x171210).strokePoints(pts([[-56, 32], [-56, -18], [-40, -32], [40, -32], [56, -18], [56, 32]]), false);
  }
}
