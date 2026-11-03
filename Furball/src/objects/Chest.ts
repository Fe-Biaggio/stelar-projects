import Phaser from 'phaser';

const SCALE = 1;
const BODY_W = 60;
const BODY_H = 30;

/** Baú no chão. Bloqueia a passagem e abre quando o gato encosta nele. */
export class Chest {
  readonly body: Phaser.Physics.Arcade.StaticBody;
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    public opened: boolean,
    /** "gold" precisa de chave e dá um item; "wood" abre sem chave e dá coletáveis. */
    readonly variant: 'gold' | 'wood' = 'gold',
  ) {
    scene.add.ellipse(x, y - 4, 70, 18, 0x000000, 0.35).setDepth(y - 1);
    this.sprite = scene.add
      .sprite(x, y, variant === 'wood' ? 'chest_wood' : 'chest', opened ? 1 : 0)
      .setOrigin(0.5, 0.97)
      .setScale(SCALE)
      .setDepth(y);
    this.body = scene.physics.add.staticBody(x - BODY_W / 2, y - BODY_H, BODY_W, BODY_H);
  }

  /** Abre com um tranco e um brilho. Retorna false se já estava aberto. */
  open() {
    if (this.opened) return false;
    this.opened = true;
    this.sprite.setFrame(1);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: SCALE * 1.15,
      scaleY: SCALE * 0.85,
      duration: 80,
      yoyo: true,
      ease: 'Quad.Out',
    });
    // Faíscas douradas saindo do baú
    for (let i = 0; i < 10; i++) {
      const spark = this.scene.add
        .circle(this.x + Phaser.Math.Between(-18, 18), this.y - 30, Phaser.Math.FloatBetween(2, 3.5), 0xffd65a)
        .setDepth(this.y + 1);
      this.scene.tweens.add({
        targets: spark,
        x: spark.x + Phaser.Math.Between(-30, 30),
        y: spark.y - Phaser.Math.Between(30, 70),
        alpha: 0,
        duration: Phaser.Math.Between(400, 700),
        ease: 'Quad.Out',
        onComplete: () => spark.destroy(),
      });
    }
    return true;
  }

  /** Fecha de novo (botão de teste). */
  close() {
    this.opened = false;
    this.sprite.setFrame(0);
    this.sprite.setScale(SCALE * 0.6);
    this.scene.tweens.add({ targets: this.sprite, scale: SCALE, duration: 250, ease: 'Back.Out' });
  }
}
