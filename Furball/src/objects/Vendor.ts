import Phaser from 'phaser';
import { CatId } from '../cats';

const SCALE = 0.85;
const COUNTER_W = 300;
const COUNTER_H = 46;

/** Gato vendedor atrás de uma bancada de madeira. Fala em um balão quando você compra. */
export class Vendor {
  readonly body: Phaser.Physics.Arcade.StaticBody;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private bubble?: Phaser.GameObjects.Container;
  private talkTimer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    cat: CatId,
  ) {
    // Gato atrás da bancada (só a parte de cima aparece)
    this.sprite = scene.add
      .sprite(x, y - 6, `cat_${cat}`, 0)
      .setOrigin(0.5, 0.97)
      .setScale(SCALE)
      .setDepth(y - 2);

    // Bancada: tampo claro, frente de tábuas e um pano listrado
    const g = scene.add.graphics().setDepth(y);
    const left = x - COUNTER_W / 2;
    const top = y - 18;
    g.fillStyle(0x000000, 0.3).fillRoundedRect(left + 4, top + 10, COUNTER_W, COUNTER_H, 6);
    g.fillStyle(0x6e4528).fillRoundedRect(left, top + 8, COUNTER_W, COUNTER_H - 6, 4);
    g.lineStyle(2, 0x3a2414);
    for (let px = left + 30; px < left + COUNTER_W; px += 30) g.lineBetween(px, top + 14, px, top + COUNTER_H);
    g.fillStyle(0x9a6a40).fillRoundedRect(left - 6, top, COUNTER_W + 12, 14, 4);
    g.fillStyle(0xc08a58).fillRect(left - 2, top + 2, COUNTER_W + 4, 3);
    g.lineStyle(3, 0x24160c).strokeRoundedRect(left - 6, top, COUNTER_W + 12, COUNTER_H + 4, 5);
    // Toldo listrado pendurado na frente
    for (let i = 0; i < 10; i++) {
      g.fillStyle(i % 2 ? 0xf2e6cf : 0xc9423a);
      g.fillTriangle(left + i * 30, top + 14, left + i * 30 + 30, top + 14, left + i * 30 + 15, top + 26);
    }
    // Plaquinha de "LOJA" e um saco de moedas em cima da bancada
    g.fillStyle(0x24160c).fillRoundedRect(x + 70, top - 26, 66, 24, 4);
    g.fillStyle(0xe8d2a6).fillRoundedRect(x + 72, top - 24, 62, 20, 3);
    scene.add
      .text(x + 103, top - 14, 'LOJA', { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#5a3216' })
      .setOrigin(0.5)
      .setDepth(y + 1);
    g.fillStyle(0x24160c).fillCircle(x - 110, top - 4, 13);
    g.fillStyle(0xb88a4a).fillCircle(x - 110, top - 4, 11);
    g.fillStyle(0xf2c040).fillCircle(x - 110, top - 18, 5).fillCircle(x - 100, top - 15, 5);

    this.body = scene.physics.add.staticBody(left - 6, top, COUNTER_W + 12, COUNTER_H);
  }

  update(time: number) {
    if (this.scene.tweens.isTweening(this.sprite)) return;
    const breathe = Math.sin(time / 450) * 0.015;
    this.sprite.setScale(SCALE * (1 - breathe * 0.5), SCALE * (1 + breathe));
  }

  /** Balão de fala por cima do vendedor. `happy` abre a boca e dá um pulinho. */
  say(text: string, happy = false) {
    this.bubble?.destroy();
    this.talkTimer?.remove();
    const label = this.scene.add
      .text(0, 0, text, { fontFamily: 'monospace', fontSize: '15px', color: '#2a1a10' })
      .setOrigin(0.5);
    const w = label.width + 20;
    const h = label.height + 12;
    const g = this.scene.add.graphics();
    g.fillStyle(0xfff6e6).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.fillTriangle(-6, h / 2 - 1, 6, h / 2 - 1, 0, h / 2 + 9);
    g.lineStyle(2, 0x2a1a10).strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const bubble = this.scene.add.container(this.x, this.y - 104, [g, label]).setDepth(30_000).setScale(0.5);
    this.bubble = bubble;
    this.scene.tweens.add({ targets: bubble, scale: 1, duration: 150, ease: 'Back.Out' });
    this.talkTimer = this.scene.time.delayedCall(1600, () =>
      this.scene.tweens.add({ targets: bubble, alpha: 0, duration: 250, onComplete: () => bubble.destroy() }),
    );

    if (happy) {
      this.sprite.setFrame(4);
      this.scene.time.delayedCall(400, () => this.sprite.setFrame(0));
      this.scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 10, duration: 120, yoyo: true, ease: 'Quad.Out' });
    } else {
      this.scene.tweens.add({ targets: this.sprite, x: this.x + 4, duration: 50, yoyo: true, repeat: 3 });
    }
  }
}
