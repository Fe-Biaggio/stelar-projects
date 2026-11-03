import Phaser from 'phaser';
import { PICKUP_FRAME } from '../pickups';

export const FUSE_TIME = 2.5; // segundos até explodir
const SCALE = 0.95;
const BODY_SIZE = 26;
const DRAG = 520; // quanto a bomba freia depois de empurrada (px/s²)
const MAX_SPEED = 420;

/**
 * Bomba colocada no chão. Tem física própria: o gato pode empurrá-la, e ela quica nas paredes.
 * Enquanto o gato ainda está em cima dela (logo depois de colocar), ela não o bloqueia.
 */
export class Bomb {
  readonly body: Phaser.Physics.Arcade.Body;
  exploded = false;
  /** Fica true quando o gato sai de cima da bomba recém-colocada. */
  solid = false;
  /** Colisões ligadas a esta bomba; são removidas quando ela explode. */
  readonly colliders: Phaser.Physics.Arcade.Collider[] = [];
  private fuse = FUSE_TIME;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly spark: Phaser.GameObjects.Arc;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly onExplode: (bomb: Bomb) => void,
  ) {
    this.body = scene.physics.add.body(x - BODY_SIZE / 2, y - BODY_SIZE + 4, BODY_SIZE, BODY_SIZE);
    this.body.setCollideWorldBounds(true);
    this.body.setBounce(0.45, 0.45);
    this.body.setDrag(DRAG, DRAG);
    this.body.setMaxVelocity(MAX_SPEED, MAX_SPEED);
    this.body.setMass(0.6);

    this.shadow = scene.add.ellipse(x, y, 34, 10, 0x000000, 0.35);
    this.sprite = scene.add.image(x, y, 'pickups', PICKUP_FRAME.bomb).setOrigin(0.5, 1).setScale(SCALE);
    this.spark = scene.add.circle(x, y, 3.5, 0xffd34a);

    // Cai no chão com um pequeno quique
    this.sprite.setScale(SCALE * 1.3, SCALE * 0.7);
    scene.tweens.add({ targets: this.sprite, scaleX: SCALE, scaleY: SCALE, duration: 220, ease: 'Back.Out' });
    this.sync(0);
  }

  get x() {
    return this.body.center.x;
  }

  get y() {
    return this.body.bottom - 4;
  }

  /** Faz explodir quase na hora (ex.: atingida por outra explosão). */
  shortenFuse(seconds = 0.12) {
    this.fuse = Math.min(this.fuse, seconds);
  }

  update(dt: number, time: number) {
    if (this.exploded) return;
    this.fuse -= dt;
    this.sync(time);
    if (this.fuse <= 0) this.explode();
  }

  private sync(time: number) {
    const x = this.x;
    const y = this.y;
    this.shadow.setPosition(x, y).setDepth(y - 1);
    this.sprite.setPosition(x, y).setDepth(y);

    // Pisca em vermelho cada vez mais rápido conforme o pavio acaba.
    const left = Math.max(this.fuse, 0) / FUSE_TIME; // 1 -> 0
    const rate = 3 + (1 - left) * 14; // piscadas por segundo
    const on = Math.sin((time / 1000) * rate * Math.PI * 2) > 0.3;
    if (on) this.sprite.setTint(0xff5040);
    else this.sprite.clearTint();
    // Incha um pouco no final
    if (!this.scene.tweens.isTweening(this.sprite)) {
      const swell = 1 + (1 - left) * 0.18 + (on ? 0.04 : 0);
      this.sprite.setScale(SCALE * swell);
    }

    // Faísca do pavio (ponta de cima, à direita), tremulando
    const flicker = 2.5 + Math.random() * 2.5;
    this.spark
      .setPosition(x + 10 + Math.random() * 3, y - 36 - Math.random() * 3)
      .setRadius(flicker)
      .setFillStyle(Math.random() > 0.5 ? 0xffd34a : 0xff8a2a)
      .setDepth(y + 1);
  }

  private explode() {
    this.exploded = true;
    this.sprite.destroy();
    this.shadow.destroy();
    this.spark.destroy();
    this.onExplode(this); // ainda lê x/y do corpo, então ele só é removido depois
    for (const c of this.colliders) if (c.world) c.destroy();
    this.body.enable = false;
    this.body.destroy();
  }
}
