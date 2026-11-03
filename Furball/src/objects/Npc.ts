import Phaser from 'phaser';

export type NpcKind = 'beggar' | 'vampire';

/**
 * Gatinhos que pedem algo:
 *  - pedinte: recebe 1 moeda por toque;
 *  - vampiro: recebe 1 ponto de vida (meio coração) por toque.
 * Eles só ficam parados, falam num balão e vão embora depois de entregar 2 itens.
 */
export class Npc {
  readonly body: Phaser.Physics.Arcade.StaticBody;
  private readonly parts: Phaser.GameObjects.GameObject[] = [];
  private readonly sprite: Phaser.GameObjects.Sprite;
  private bubble?: Phaser.GameObjects.Container;
  gone = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    readonly kind: NpcKind,
  ) {
    const depth = y;
    const shadow = scene.add.ellipse(x, y - 4, 56, 16, 0x000000, 0.35).setDepth(depth - 2);
    this.parts.push(shadow);
    if (kind === 'vampire') {
      // Capa preta com forro vermelho atrás do gato
      const cape = scene.add.graphics().setDepth(depth - 1);
      cape.fillStyle(0x1a0a0e).fillTriangle(x - 40, y - 4, x + 40, y - 4, x, y - 74);
      cape.fillStyle(0x8a1020).fillTriangle(x - 30, y - 6, x + 30, y - 6, x, y - 62);
      cape.fillStyle(0x1a0a0e).fillTriangle(x - 46, y - 58, x - 18, y - 70, x - 26, y - 44);
      cape.fillStyle(0x1a0a0e).fillTriangle(x + 46, y - 58, x + 18, y - 70, x + 26, y - 44);
      this.parts.push(cape);
    }
    this.sprite = scene.add
      .sprite(x, y, kind === 'vampire' ? 'cat_black' : 'cat_tuxedo', 0)
      .setOrigin(0.5, 0.97)
      .setScale(0.8)
      .setDepth(depth);
    if (kind === 'vampire') {
      this.sprite.setTint(0xb8a8c8);
      // Dentinhos
      const fangs = scene.add.graphics().setDepth(depth + 1);
      fangs.fillStyle(0xffffff).fillTriangle(x - 7, y - 26, x - 3, y - 26, x - 5, y - 19);
      fangs.fillTriangle(x + 3, y - 26, x + 7, y - 26, x + 5, y - 19);
      this.parts.push(fangs);
    } else {
      // Latinha de pedir moedas
      const can = scene.add.graphics().setDepth(depth + 1);
      can.fillStyle(0x1a1210).fillRoundedRect(x + 20, y - 26, 22, 24, 3);
      can.fillStyle(0x9aa0a8).fillRoundedRect(x + 22, y - 24, 18, 20, 2);
      can.fillStyle(0xf2c040).fillCircle(x + 31, y - 24, 4);
      this.parts.push(can);
    }
    this.parts.push(this.sprite);
    this.body = scene.physics.add.staticBody(x - 26, y - 26, 52, 26);
    this.say(kind === 'vampire' ? 'Um pouquinho de sangue?' : 'Uma moedinha, por favor?');
  }

  update(time: number) {
    if (this.gone || this.scene.tweens.isTweening(this.sprite)) return;
    const breathe = Math.sin(time / 400) * 0.015;
    this.sprite.setScale(0.8 * (1 - breathe * 0.5), 0.8 * (1 + breathe));
  }

  /** Balão de fala acima do gatinho. */
  say(text: string) {
    this.bubble?.destroy();
    const label = this.scene.add
      .text(0, 0, text, { fontFamily: 'monospace', fontSize: '14px', color: '#2a1a10' })
      .setOrigin(0.5);
    const w = label.width + 18;
    const h = label.height + 10;
    const g = this.scene.add.graphics();
    g.fillStyle(0xfff6e6).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.fillTriangle(-6, h / 2 - 1, 6, h / 2 - 1, 0, h / 2 + 8);
    g.lineStyle(2, 0x2a1a10).strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const bubble = this.scene.add.container(this.x, this.y - 96, [g, label]).setDepth(30_000).setScale(0.5);
    this.bubble = bubble;
    this.scene.tweens.add({ targets: bubble, scale: 1, duration: 150, ease: 'Back.Out' });
    this.scene.time.delayedCall(1800, () => {
      if (this.bubble === bubble) this.scene.tweens.add({ targets: bubble, alpha: 0, duration: 250, onComplete: () => bubble.destroy() });
    });
  }

  /** Reação ao receber: pulinho. */
  thank() {
    this.scene.tweens.add({ targets: this.sprite, y: this.y - 12, duration: 110, yoyo: true, ease: 'Quad.Out' });
  }

  /** Vai embora: some com um "puf". */
  leave(farewell: string) {
    if (this.gone) return;
    this.gone = true;
    this.body.enable = false;
    this.say(farewell);
    this.scene.time.delayedCall(900, () => {
      this.scene.tweens.add({
        targets: this.parts,
        alpha: 0,
        duration: 500,
        onComplete: () => this.parts.forEach((p) => p.destroy()),
      });
    });
  }
}
