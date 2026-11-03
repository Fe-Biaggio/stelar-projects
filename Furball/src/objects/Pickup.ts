import Phaser from 'phaser';
import { PICKUP_FRAME, PickupKind } from '../pickups';
import { knockAlong } from '../world/knock';

const SCALE = 0.75;
const PICKUP_RADIUS = 26;
const SPAWN_GRACE = 400; // ms em que um coletável recém-reposto ainda não pode ser pego

/** Moeda, bomba ou chave no chão. Ao ser pega, voa até o contador no HUD. */
export class Pickup {
  collected = false;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly sparkle?: Phaser.GameObjects.Star;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly readyAt: number;
  private moving = false;

  constructor(
    private readonly scene: Phaser.Scene,
    public x: number,
    public y: number,
    readonly kind: PickupKind,
    pop = false,
    /** Identifica os coletáveis de teste, para o botão de repor não duplicar os que foram movidos. */
    readonly tag?: string,
  ) {
    this.readyAt = pop ? scene.time.now + SPAWN_GRACE : 0;
    this.shadow = scene.add.ellipse(x, y, 26, 8, 0x000000, 0.3).setDepth(y - 1);
    this.sprite = scene.add
      .image(x, y, 'pickups', PICKUP_FRAME[kind])
      .setOrigin(0.5, 1)
      .setScale(SCALE)
      .setDepth(y);

    // A chave dourada e a moeda ganham um brilho piscando.
    if (kind === 'goldenKey' || kind === 'coin') {
      this.sparkle = scene.add
        .star(x + 8, y - 28, 4, 1.5, 5, 0xfff4c0)
        .setDepth(y + 1)
        .setAlpha(0);
      scene.tweens.add({
        targets: this.sparkle,
        alpha: 1,
        scale: 1.4,
        duration: 260,
        yoyo: true,
        repeat: -1,
        repeatDelay: kind === 'goldenKey' ? 300 : 1400,
        delay: Math.random() * 800,
      });
    }

    if (pop) {
      this.sprite.setScale(0);
      scene.tweens.add({ targets: this.sprite, scale: SCALE, duration: 250, ease: 'Back.Out' });
    }
  }

  update(time: number) {
    if (this.collected || this.moving) return;
    // Balanço mais curto que o dos itens
    const bob = (Math.sin(time / 260 + this.phase) + 1) / 2;
    this.sprite.y = this.y - 2 - bob * 4;
  }

  /** Lançado pela explosão: desliza (dx, dy) pelo chão com um pulo. */
  knock(dx: number, dy: number) {
    if (this.collected) return;
    this.moving = true;
    knockAlong(
      this.scene,
      this.x,
      this.y,
      dx,
      dy,
      (x, y, lift) => {
        if (this.collected) return;
        this.sprite.setPosition(x, y - 2 - lift).setDepth(y);
        this.shadow.setPosition(x, y).setDepth(y - 1);
        this.sparkle?.setPosition(x + 8, y - 28 - lift);
      },
      (x, y) => {
        if (this.collected) return;
        this.x = x;
        this.y = y;
        this.moving = false;
      },
    );
  }

  touches(px: number, py: number) {
    if (this.collected || this.scene.time.now < this.readyAt) return false;
    return Phaser.Math.Distance.Between(px, py, this.x, this.y) < PICKUP_RADIUS;
  }

  /** Voa até o contador do HUD em (hudX, hudY) e some. */
  collect(hudX: number, hudY: number, onArrive: () => void) {
    this.collected = true;
    this.shadow.destroy();
    this.sparkle?.destroy();
    this.sprite.setDepth(25_000).setOrigin(0.5);
    this.sprite.y -= 14;
    this.scene.tweens.add({
      targets: this.sprite,
      x: hudX,
      y: hudY,
      scale: 0.45,
      duration: 380,
      ease: 'Cubic.In',
      onComplete: () => {
        this.sprite.destroy();
        onArrive();
      },
    });
  }
}
