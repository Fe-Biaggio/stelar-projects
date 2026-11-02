import Phaser from 'phaser';
import { FLOOR, GAME_HEIGHT, GAME_WIDTH, TILE, WALL } from '../config';
import { CatId } from '../cats';
import { DummyCat } from '../objects/DummyCat';
import { FURBALL_HIT_RADIUS, Furball, createFurballTexture } from '../objects/Furball';
import { Facing, MAX_HP, Player } from '../objects/Player';
import { drawRoom } from '../world/room';

type MoveKeys = Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
type AimKeys = Record<Facing, Phaser.Input.Keyboard.Key>;

// Espinhos no chão para testar a vida (coluna, linha em tiles do chão).
const SPIKES: [number, number][] = [
  [2, 1],
  [10, 5],
];

export class RoomScene extends Phaser.Scene {
  private cat: CatId = 'black';
  private player!: Player;
  private dummy!: DummyCat;
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

  init(data: { cat?: CatId }) {
    if (data.cat) this.cat = data.cat;
  }

  create() {
    this.furballs = [];
    this.spikeRects = [];
    createFurballTexture(this, this.cat);
    drawRoom(this);
    this.drawSpikes();

    this.physics.world.setBounds(FLOOR.x, FLOOR.y, FLOOR.width, FLOOR.height);

    // Gato de teste parado no meio da sala.
    this.dummy = new DummyCat(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12, 'gray');

    this.player = new Player(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + TILE * 2.5, this.cat);
    this.physics.add.collider(this.player.body, this.dummy.body);
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
      this.furballs.push(new Furball(this, this.cat, shot.x, shot.y, shot.dir, shot.height, shot.inherited));
    }

    for (const f of this.furballs) {
      f.update(dt);
      const { x, y } = f.position;
      if (!f.dead && this.dummy.hits(x, y, FURBALL_HIT_RADIUS)) {
        const d = f.direction;
        f.burst();
        this.dummy.takeHit(d.x, d.y);
      }
    }
    this.dummy.update(time);
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
      .text(cx, cy + 34, 'R para recomeçar  ·  Esc para trocar de gato', { ...style, fontSize: '20px', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    this.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 600, delay: 400 });
    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 600, delay: 600 });

    const kb = this.input.keyboard!;
    kb.once('keydown-R', () => this.scene.restart({ cat: this.cat }));
    kb.once('keydown-ESC', () => this.scene.start('Select', { cat: this.cat }));
  }

  // ---------- Cenário ----------

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
}
