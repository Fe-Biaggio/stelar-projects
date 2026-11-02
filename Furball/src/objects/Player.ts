import Phaser from 'phaser';

export type Facing = 'down' | 'up' | 'left' | 'right';

// Índice de cada direção em public/assets/cat_black.png.
const FRAME: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };

const SPEED = 270; // pixels por segundo
const ACCEL = 14; // quão rápido atinge a velocidade (maior = mais "seco")
const DECEL = 10; // quão rápido para ao soltar as teclas
const SPRITE_SCALE = 0.8;

// A colisão fica só nos pés, assim a cabeça pode passar na frente da parede de cima.
const FEET_W = 40;
const FEET_H = 22;

export class Player {
  readonly body: Phaser.Physics.Arcade.Body;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private facing: Facing = 'down';
  private walkTime = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.body = scene.physics.add.body(x - FEET_W / 2, y - FEET_H / 2, FEET_W, FEET_H);
    this.body.setCollideWorldBounds(true);

    this.shadow = scene.add.ellipse(x, y, 54, 16, 0x000000, 0.35);
    this.sprite = scene.add
      .sprite(x, y, 'cat_black', FRAME.down)
      .setOrigin(0.5, 0.97)
      .setScale(SPRITE_SCALE);
  }

  /** `dir` é a direção pedida pelo jogador, com componentes entre -1 e 1. */
  update(dir: Phaser.Math.Vector2, dt: number, time: number) {
    const moving = dir.lengthSq() > 0;
    if (moving) dir.normalize();

    // Aceleração suave, igual em qualquer taxa de quadros.
    const k = 1 - Math.exp(-(moving ? ACCEL : DECEL) * dt);
    const v = this.body.velocity;
    v.x += (dir.x * SPEED - v.x) * k;
    v.y += (dir.y * SPEED - v.y) * k;
    if (!moving && v.lengthSq() < 4) v.reset();

    if (moving) this.updateFacing(dir);
    this.sprite.setFrame(FRAME[this.facing]);

    // Posiciona sprite e sombra sobre os pés.
    const feetX = this.body.center.x;
    const feetY = this.body.bottom - 2;
    this.shadow.setPosition(feetX, feetY - 4);
    this.sprite.setDepth(feetY);
    this.shadow.setDepth(feetY - 1);

    // Só há um quadro por direção, então o andar é animado com pulinhos e balanço.
    const speedRatio = Math.min(v.length() / SPEED, 1);
    if (speedRatio > 0.1) {
      this.walkTime += dt * 11 * speedRatio;
      const hop = Math.abs(Math.sin(this.walkTime));
      this.sprite.setPosition(feetX, feetY - hop * 6 * speedRatio);
      this.sprite.setAngle(Math.sin(this.walkTime) * 5 * speedRatio);
      this.sprite.setScale(SPRITE_SCALE * (1 + (1 - hop) * 0.04), SPRITE_SCALE * (1 - (1 - hop) * 0.05));
      this.shadow.setScale(1 - hop * 0.15);
    } else {
      this.walkTime = 0;
      const breathe = Math.sin(time / 350) * 0.015;
      this.sprite.setPosition(feetX, feetY);
      this.sprite.setAngle(0);
      this.sprite.setScale(SPRITE_SCALE * (1 - breathe * 0.5), SPRITE_SCALE * (1 + breathe));
      this.shadow.setScale(1);
    }
  }

  private updateFacing(dir: Phaser.Math.Vector2) {
    const ax = Math.abs(dir.x);
    const ay = Math.abs(dir.y);
    const horizontal: Facing = dir.x < 0 ? 'left' : 'right';
    const vertical: Facing = dir.y < 0 ? 'up' : 'down';

    if (ax > ay + 0.01) this.facing = horizontal;
    else if (ay > ax + 0.01) this.facing = vertical;
    // Na diagonal, mantém a direção atual se ela fizer parte do movimento.
    else if (this.facing !== horizontal && this.facing !== vertical) this.facing = horizontal;
  }
}
