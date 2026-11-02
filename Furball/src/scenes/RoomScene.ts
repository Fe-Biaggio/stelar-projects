import Phaser from 'phaser';
import { FLOOR, GAME_HEIGHT, GAME_WIDTH, TILE, WALL } from '../config';
import { Furball, createFurballTexture } from '../objects/Furball';
import { Facing, MAX_HP, Player } from '../objects/Player';

type MoveKeys = Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
type AimKeys = Record<Facing, Phaser.Input.Keyboard.Key>;

// Espinhos no chão para testar a vida (coluna, linha em tiles do chão).
const SPIKES: [number, number][] = [
  [2, 1],
  [10, 5],
];

export class RoomScene extends Phaser.Scene {
  private player!: Player;
  private moveKeys!: MoveKeys;
  private aimKeys!: AimKeys;
  private furballs: Furball[] = [];
  private spikeRects: Phaser.Geom.Rectangle[] = [];
  private hearts: Phaser.GameObjects.Image[] = [];
  private hint?: Phaser.GameObjects.Text;
  private readonly move = new Phaser.Math.Vector2();

  constructor() {
    super('Room');
  }

  preload() {
    this.load.spritesheet('cat_black', 'assets/cat_black.png', { frameWidth: 80, frameHeight: 96 });
    this.load.spritesheet('hearts', 'assets/hearts.png', { frameWidth: 32, frameHeight: 30 });
  }

  create() {
    this.furballs = [];
    this.spikeRects = [];
    createFurballTexture(this);
    this.drawRoom();
    this.drawSpikes();

    this.physics.world.setBounds(FLOOR.x, FLOOR.y, FLOOR.width, FLOOR.height);
    this.player = new Player(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + TILE);
    this.player.on('hp', (hp: number) => this.updateHearts(hp, true));
    this.player.on('dead', () => this.showGameOver());

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.moveKeys = kb.addKeys({ w: K.W, a: K.A, s: K.S, d: K.D }) as MoveKeys;
    this.aimKeys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT }) as AimKeys;
    kb.addCapture([K.UP, K.DOWN, K.LEFT, K.RIGHT]); // não rolar a página com as setas

    this.createHud();

    this.hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - WALL - 28, 'WASD para andar  ·  setas para atirar', {
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
    // Limita o passo para a física não dar saltos se a aba ficar em segundo plano.
    const dt = Math.min(deltaMs, 50) / 1000;

    const k = this.moveKeys;
    this.move.set((k.d.isDown ? 1 : 0) - (k.a.isDown ? 1 : 0), (k.s.isDown ? 1 : 0) - (k.w.isDown ? 1 : 0));
    const aim = this.currentAim();

    if (this.hint && (this.move.lengthSq() > 0 || aim)) {
      const hint = this.hint;
      this.hint = undefined;
      this.tweens.add({ targets: hint, alpha: 0, duration: 800, delay: 2000, onComplete: () => hint.destroy() });
    }

    const shot = this.player.update(this.move, aim, dt, time);
    if (shot) {
      this.furballs.push(new Furball(this, shot.x, shot.y, shot.dir, shot.height, shot.inherited));
    }

    for (const f of this.furballs) f.update(dt);
    this.furballs = this.furballs.filter((f) => !f.dead);

    this.checkSpikes();
  }

  /** A seta pressionada por último manda, como no Isaac. */
  private currentAim(): Facing | null {
    let best: Facing | null = null;
    let bestTime = -Infinity;
    for (const dir of Object.keys(this.aimKeys) as Facing[]) {
      const key = this.aimKeys[dir];
      if (key.isDown && key.timeDown > bestTime) {
        best = dir;
        bestTime = key.timeDown;
      }
    }
    return best;
  }

  private checkSpikes() {
    if (this.player.dead) return;
    const feet = this.player.body;
    const feetRect = new Phaser.Geom.Rectangle(feet.x, feet.y, feet.width, feet.height);
    for (const r of this.spikeRects) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(feetRect, r)) {
        this.player.takeDamage(1, r.centerX, r.centerY);
        return;
      }
    }
  }

  // ---------- HUD ----------

  private createHud() {
    this.hearts = [];
    for (let i = 0; i < MAX_HP; i++) {
      this.hearts.push(
        this.add
          .image(26 + i * 34, 22, 'hearts', 0)
          .setOrigin(0, 0)
          .setDepth(20_000),
      );
    }
    this.updateHearts(this.player.hp, false);
  }

  private updateHearts(hp: number, animate: boolean) {
    this.hearts.forEach((heart, i) => {
      const wasFull = heart.frame.name === '0';
      const full = i < hp;
      heart.setFrame(full ? 0 : 1);
      if (animate && wasFull && !full) {
        heart.setScale(1.5);
        this.tweens.add({ targets: heart, scale: 1, duration: 250, ease: 'Back.Out' });
      }
    });
  }

  private showGameOver() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setDepth(30_000);
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 6 };
    const title = this.add
      .text(cx, cy - 20, 'Fim de jogo', { ...style, fontSize: '48px' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    const sub = this.add
      .text(cx, cy + 34, 'Pressione R para recomeçar', { ...style, fontSize: '20px', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    this.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 600, delay: 400 });
    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 600, delay: 600 });

    this.input.keyboard!.once('keydown-R', () => this.scene.restart());
  }

  // ---------- Cenário ----------

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

  /** Placas de espinhos de metal; tocar nelas tira um coração. */
  private drawSpikes() {
    const g = this.add.graphics().setDepth(-50);
    for (const [col, row] of SPIKES) {
      const x = FLOOR.x + col * TILE;
      const y = FLOOR.y + row * TILE;
      g.fillStyle(0x000000, 0.25).fillRoundedRect(x + 4, y + 6, TILE - 6, TILE - 6, 6);
      g.fillStyle(0x3b3532).fillRoundedRect(x + 4, y + 4, TILE - 8, TILE - 8, 6);
      g.lineStyle(2, 0x171312).strokeRoundedRect(x + 4, y + 4, TILE - 8, TILE - 8, 6);
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          const sx = x + 16 + i * 16;
          const sy = y + 22 + j * 16;
          g.fillStyle(0x000000, 0.35).fillEllipse(sx, sy + 2, 12, 5);
          g.fillStyle(0x8f8984).fillTriangle(sx - 5, sy, sx + 5, sy, sx, sy - 14);
          g.fillStyle(0xd8d2cc).fillTriangle(sx - 2, sy - 1, sx, sy - 1, sx, sy - 12);
          g.lineStyle(1.5, 0x1d1917).strokeTriangle(sx - 5, sy, sx + 5, sy, sx, sy - 14);
        }
      }
      this.spikeRects.push(new Phaser.Geom.Rectangle(x + 10, y + 10, TILE - 20, TILE - 20));
    }
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
