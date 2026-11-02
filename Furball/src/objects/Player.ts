import Phaser from 'phaser';

export type Facing = 'down' | 'up' | 'left' | 'right';

// Índice de cada direção em public/assets/cat_black.png.
const FRAME: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };
// Boca aberta (de costas não aparece a boca, então repete o frame de costas).
const FRAME_SHOOT: Record<Facing, number> = { down: 4, up: 1, left: 5, right: 6 };

export const DIR_VECTOR: Record<Facing, Phaser.Math.Vector2> = {
  down: new Phaser.Math.Vector2(0, 1),
  up: new Phaser.Math.Vector2(0, -1),
  left: new Phaser.Math.Vector2(-1, 0),
  right: new Phaser.Math.Vector2(1, 0),
};

// Posição da boca em relação aos pés, já na escala do sprite: [x, altura].
const MOUTH: Record<Facing, [number, number]> = {
  down: [0, 27],
  up: [0, 34],
  left: [-18, 27],
  right: [18, 27],
};

const SPEED = 270; // pixels por segundo
const ACCEL = 14; // quão rápido atinge a velocidade (maior = mais "seco")
const DECEL = 10; // quão rápido para ao soltar as teclas
const SPRITE_SCALE = 0.8;

const FIRE_DELAY = 0.4; // segundos entre tiros
const MOUTH_OPEN_TIME = 0.16; // quanto tempo a boca fica aberta após atirar

export const MAX_HP = 3;
const INVULNERABLE_TIME = 1.0; // segundos piscando após levar dano
const KNOCKBACK = 380;

// A colisão fica só nos pés, assim a cabeça pode passar na frente da parede de cima.
const FEET_W = 40;
const FEET_H = 22;

export interface ShotRequest {
  x: number;
  y: number;
  height: number;
  dir: Phaser.Math.Vector2;
  inherited: Phaser.Math.Vector2;
}

/**
 * O gato jogador. Eventos emitidos:
 *  - 'hp' (hp: number) quando a vida muda
 *  - 'dead' quando a vida chega a zero
 */
export class Player extends Phaser.Events.EventEmitter {
  readonly body: Phaser.Physics.Arcade.Body;
  hp = MAX_HP;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private facing: Facing = 'down';
  private walkTime = 0;
  private fireCooldown = 0;
  private mouthTimer = 0;
  private invulnerable = 0;

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    super();
    this.body = scene.physics.add.body(x - FEET_W / 2, y - FEET_H / 2, FEET_W, FEET_H);
    this.body.setCollideWorldBounds(true);

    this.shadow = scene.add.ellipse(x, y, 54, 16, 0x000000, 0.35);
    this.sprite = scene.add
      .sprite(x, y, 'cat_black', FRAME.down)
      .setOrigin(0.5, 0.97)
      .setScale(SPRITE_SCALE);
  }

  get dead() {
    return this.hp <= 0;
  }

  get feet() {
    return { x: this.body.center.x, y: this.body.bottom - 2 };
  }

  /**
   * `move`: direção pedida (componentes entre -1 e 1).
   * `aim`: direção do tiro enquanto a tecla está pressionada, ou null.
   * Retorna um pedido de tiro quando o gato cospe uma bola de pelo.
   */
  update(move: Phaser.Math.Vector2, aim: Facing | null, dt: number, time: number): ShotRequest | null {
    if (this.dead) return null;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.mouthTimer = Math.max(0, this.mouthTimer - dt);
    this.updateInvulnerability(dt);

    const moving = move.lengthSq() > 0;
    if (moving) move.normalize();

    // Aceleração suave, igual em qualquer taxa de quadros.
    const k = 1 - Math.exp(-(moving ? ACCEL : DECEL) * dt);
    const v = this.body.velocity;
    v.x += (move.x * SPEED - v.x) * k;
    v.y += (move.y * SPEED - v.y) * k;
    if (!moving && v.lengthSq() < 4) v.reset();

    // Atirando, o gato olha para onde atira; senão, para onde anda.
    if (aim) this.facing = aim;
    else if (moving) this.updateFacing(move);

    let shot: ShotRequest | null = null;
    if (aim && this.fireCooldown === 0) {
      this.fireCooldown = FIRE_DELAY;
      this.mouthTimer = MOUTH_OPEN_TIME;
      const [mx, mh] = MOUTH[aim];
      const dir = DIR_VECTOR[aim];
      shot = {
        x: this.feet.x + mx + dir.x * 6,
        y: this.feet.y + dir.y * 6,
        height: mh,
        dir: dir.clone(),
        inherited: v.clone(),
      };
      // Pequeno "solavanco" ao cuspir
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: SPRITE_SCALE * 1.08,
        scaleY: SPRITE_SCALE * 0.92,
        duration: 60,
        yoyo: true,
      });
    }

    this.sprite.setFrame(this.mouthTimer > 0 ? FRAME_SHOOT[this.facing] : FRAME[this.facing]);
    this.animate(dt, time);
    return shot;
  }

  /** Tira vida e empurra o gato para longe de (fromX, fromY). */
  takeDamage(amount: number, fromX: number, fromY: number) {
    if (this.dead || this.invulnerable > 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.emit('hp', this.hp);

    const push = new Phaser.Math.Vector2(this.feet.x - fromX, this.feet.y - fromY);
    if (push.lengthSq() === 0) push.set(0, 1);
    push.normalize().scale(KNOCKBACK);
    this.body.velocity.set(push.x, push.y);

    this.sprite.setTintFill(0xff4040);
    this.scene.time.delayedCall(90, () => this.sprite.clearTint());
    this.scene.cameras.main.shake(140, 0.006);

    if (this.dead) {
      this.die();
    } else {
      this.invulnerable = INVULNERABLE_TIME;
    }
  }

  private die() {
    this.body.velocity.reset();
    this.body.enable = false;
    this.sprite.setFrame(FRAME.down).setAlpha(1);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 90,
      y: this.sprite.y + 4,
      scaleY: SPRITE_SCALE * 0.9,
      duration: 380,
      ease: 'Bounce.Out',
    });
    this.scene.tweens.add({ targets: this.shadow, scaleX: 1.4, duration: 380 });
    this.emit('dead');
  }

  private updateInvulnerability(dt: number) {
    if (this.invulnerable <= 0) return;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    // Pisca enquanto está invulnerável
    this.sprite.setAlpha(this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 === 0 ? 0.3 : 1);
  }

  private animate(dt: number, time: number) {
    // Posiciona sprite e sombra sobre os pés.
    const { x: feetX, y: feetY } = this.feet;
    this.shadow.setPosition(feetX, feetY - 4);
    this.sprite.setDepth(feetY);
    this.shadow.setDepth(feetY - 1);

    // Só há um quadro por direção, então o andar é animado com pulinhos e balanço.
    const speedRatio = Math.min(this.body.velocity.length() / SPEED, 1);
    const tweening = this.scene.tweens.isTweening(this.sprite);
    if (speedRatio > 0.1) {
      this.walkTime += dt * 11 * speedRatio;
      const hop = Math.abs(Math.sin(this.walkTime));
      this.sprite.setPosition(feetX, feetY - hop * 6 * speedRatio);
      this.sprite.setAngle(Math.sin(this.walkTime) * 5 * speedRatio);
      if (!tweening) {
        this.sprite.setScale(SPRITE_SCALE * (1 + (1 - hop) * 0.04), SPRITE_SCALE * (1 - (1 - hop) * 0.05));
      }
      this.shadow.setScale(1 - hop * 0.15);
    } else {
      this.walkTime = 0;
      this.sprite.setPosition(feetX, feetY);
      this.sprite.setAngle(0);
      if (!tweening) {
        const breathe = Math.sin(time / 350) * 0.015;
        this.sprite.setScale(SPRITE_SCALE * (1 - breathe * 0.5), SPRITE_SCALE * (1 + breathe));
      }
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
