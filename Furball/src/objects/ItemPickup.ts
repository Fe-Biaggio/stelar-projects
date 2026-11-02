import Phaser from 'phaser';
import { ITEMS, ItemId, ItemInfo } from '../items';

const ITEM_SCALE = 0.72;
const PICKUP_RADIUS = 30; // distância dos pés do gato até o item
const SPAWN_GRACE = 500; // ms em que um item recém-reposto ainda não pode ser pego

/** Item parado no chão, flutuando, esperando o gato passar por cima. */
export class ItemPickup {
  readonly info: ItemInfo;
  collected = false;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly readyAt: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    id: ItemId,
    animate = false,
  ) {
    this.info = ITEMS[id];
    this.readyAt = animate ? scene.time.now + SPAWN_GRACE : 0;
    this.shadow = scene.add.ellipse(x, y, 34, 10, 0x000000, 0.3).setDepth(y - 1);
    this.sprite = scene.add
      .image(x, y, 'items', this.info.frame)
      .setOrigin(0.5, 1)
      .setScale(ITEM_SCALE)
      .setDepth(y);

    if (animate) {
      // Surge com um "pop"
      this.sprite.setScale(0);
      this.shadow.setScale(0);
      scene.tweens.add({ targets: this.sprite, scale: ITEM_SCALE, duration: 300, ease: 'Back.Out' });
      scene.tweens.add({ targets: this.shadow, scale: 1, duration: 300 });
    }
  }

  update(time: number) {
    if (this.collected) return;
    const bob = (Math.sin(time / 300 + this.phase) + 1) / 2; // 0..1
    this.sprite.y = this.y - 6 - bob * 6;
    this.shadow.setScale(1 - bob * 0.2);
  }

  touches(px: number, py: number) {
    if (this.collected || this.scene.time.now < this.readyAt) return false;
    return Phaser.Math.Distance.Between(px, py, this.x, this.y) < PICKUP_RADIUS;
  }

  /** Sobe por cima da cabeça do gato e some (como no Isaac). */
  collect(overX: number, overY: number) {
    this.collected = true;
    this.shadow.destroy();
    this.sprite.setDepth(25_000);
    this.scene.tweens.add({
      targets: this.sprite,
      x: overX,
      y: overY - 76,
      scale: ITEM_SCALE * 1.15,
      duration: 220,
      ease: 'Back.Out',
      onComplete: () =>
        this.scene.tweens.add({
          targets: this.sprite,
          y: overY - 96,
          alpha: 0,
          delay: 500,
          duration: 300,
          onComplete: () => this.sprite.destroy(),
        }),
    });
  }
}
