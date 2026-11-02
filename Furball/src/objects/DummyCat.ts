import Phaser from 'phaser';
import { CatId } from '../cats';

const SPRITE_SCALE = 0.8;
const MAX_HP = 4; // bolas de pelo até morrer
const RESPAWN_DELAY = 2500; // ms até um novo gato de teste aparecer

// Área de acerto em volta dos pés (elipse), em pixels.
// A bola voa acima do chão, então a área vai um pouco além dos pés para acompanhar o que se vê.
const HIT_RX = 30;
const HIT_RY = 34;
// Bloqueio físico, para o jogador não atravessar o gato.
const BODY_W = 44;
const BODY_H = 24;

const FRAME_IDLE = 0;
const FRAME_OUCH = 4; // boca aberta

/** Gato parado no meio da sala, só para testar os tiros. */
export class DummyCat {
  hp = MAX_HP;
  readonly body: Phaser.Physics.Arcade.StaticBody;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly pips: Phaser.GameObjects.Arc[] = [];
  private hurtTimer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    cat: CatId,
  ) {
    this.body = scene.physics.add.staticBody(x - BODY_W / 2, y - BODY_H + 4, BODY_W, BODY_H);
    this.shadow = scene.add.ellipse(x, y - 4, 56, 16, 0x000000, 0.35).setDepth(y - 1);
    this.sprite = scene.add
      .sprite(x, y, `cat_${cat}`, FRAME_IDLE)
      .setOrigin(0.5, 0.97)
      .setScale(SPRITE_SCALE)
      .setDepth(y);

    // Bolinhas de vida acima da cabeça (só para o teste).
    for (let i = 0; i < MAX_HP; i++) {
      this.pips.push(
        scene.add
          .circle(x + (i - (MAX_HP - 1) / 2) * 12, y - 92, 4, 0xd63a3a)
          .setStrokeStyle(2, 0x1a0e0e)
          .setDepth(10_000),
      );
    }
  }

  get alive() {
    return this.hp > 0;
  }

  /** Verifica se uma bola de pelo no chão em (px, py) acerta o gato. */
  hits(px: number, py: number, radius: number) {
    if (!this.alive) return false;
    const dx = (px - this.x) / (HIT_RX + radius);
    const dy = (py - (this.y - 8)) / (HIT_RY + radius);
    return dx * dx + dy * dy <= 1;
  }

  /** Recebe um tiro vindo na direção (dirX, dirY). */
  takeHit(dirX: number, dirY: number) {
    if (!this.alive) return;
    this.hp -= 1;
    this.updatePips();

    // Pisca branco, abre a boca e é empurrado um pouco na direção do tiro.
    this.sprite.setTintFill(0xffffff);
    this.sprite.setFrame(FRAME_OUCH);
    this.hurtTimer?.remove();
    this.scene.time.delayedCall(70, () => this.sprite.setTint(0xff8080));
    this.hurtTimer = this.scene.time.delayedCall(180, () => {
      this.sprite.clearTint();
      if (this.alive) this.sprite.setFrame(FRAME_IDLE);
    });

    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(this.x, this.y).setScale(SPRITE_SCALE).setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.x + dirX * 7,
      y: this.y + dirY * 4,
      scaleX: SPRITE_SCALE * 1.12,
      scaleY: SPRITE_SCALE * 0.86,
      angle: dirX * 6,
      duration: 70,
      yoyo: true,
      ease: 'Quad.Out',
    });

    if (!this.alive) this.die(dirX);
  }

  private die(dirX: number) {
    this.body.enable = false;
    this.scene.time.delayedCall(150, () => {
      this.sprite.setFrame(FRAME_OUCH).clearTint();
      const side = dirX < 0 ? -1 : 1;
      this.scene.tweens.add({
        targets: this.sprite,
        angle: 90 * side,
        y: this.y + 4,
        duration: 350,
        ease: 'Bounce.Out',
      });
      this.scene.tweens.add({ targets: this.shadow, scaleX: 1.4, duration: 350 });
      this.scene.tweens.add({
        targets: [this.sprite, this.shadow],
        alpha: 0,
        delay: 900,
        duration: 500,
        onComplete: () => this.scene.time.delayedCall(RESPAWN_DELAY - 1400, () => this.respawn()),
      });
    });
  }

  private respawn() {
    if (!this.sprite.active) return; // cena reiniciada
    this.hp = MAX_HP;
    this.updatePips();
    this.body.enable = true;
    this.sprite.setFrame(FRAME_IDLE).setAngle(0).setPosition(this.x, this.y).setScale(SPRITE_SCALE * 0.2);
    this.shadow.setScale(1);
    this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 1, duration: 250 });
    this.scene.tweens.add({ targets: this.sprite, scale: SPRITE_SCALE, duration: 350, ease: 'Back.Out' });
  }

  private updatePips() {
    this.pips.forEach((pip, i) => pip.setFillStyle(i < this.hp ? 0xd63a3a : 0x3a2a2a));
  }

  /** Respiração parada, para não parecer uma estátua. */
  update(time: number) {
    if (!this.alive || this.scene.tweens.isTweening(this.sprite)) return;
    const breathe = Math.sin(time / 420) * 0.015;
    this.sprite.setScale(SPRITE_SCALE * (1 - breathe * 0.5), SPRITE_SCALE * (1 + breathe));
  }
}
