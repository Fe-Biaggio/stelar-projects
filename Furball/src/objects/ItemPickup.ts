import Phaser from 'phaser';
import { ITEMS, ItemId, ItemInfo } from '../items';
import { RARITY_INFO } from '../rarity';
import { knockAlong } from '../world/knock';

const ITEM_SCALE = 0.72;
const PICKUP_RADIUS = 30; // distância dos pés do gato até o item
const SPAWN_GRACE = 500; // ms em que um item recém-aparecido ainda não pode ser pego
const TOSS_TIME = 550; // ms do arco do item saindo do baú

/** Como o item aparece: já no chão, com um "pop", ou arremessado de um ponto (o baú). */
export type ItemSpawn = { kind: 'none' } | { kind: 'pop' } | { kind: 'toss'; fromX: number; fromY: number };

/** Item parado no chão, flutuando, esperando o gato passar por cima. */
export class ItemPickup {
  readonly info: ItemInfo;
  collected = false;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly glow?: Phaser.GameObjects.Ellipse;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly readyAt: number;
  /** Enquanto o item voa do baú, o balanço fica desligado. */
  private landed = true;

  constructor(
    private readonly scene: Phaser.Scene,
    public x: number,
    public y: number,
    id: ItemId,
    spawn: ItemSpawn = { kind: 'none' },
  ) {
    this.info = ITEMS[id];
    const now = scene.time.now;
    this.readyAt = spawn.kind === 'none' ? 0 : now + (spawn.kind === 'toss' ? TOSS_TIME : SPAWN_GRACE);

    // Brilho no chão com a cor da raridade (o comum não brilha).
    if (this.info.rarity !== 'common') {
      this.glow = scene.add
        .ellipse(x, y - 2, 64, 22, RARITY_INFO[this.info.rarity].glow, 0.75)
        .setDepth(y - 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: this.glow, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    this.shadow = scene.add.ellipse(x, y, 34, 10, 0x000000, 0.3).setDepth(y - 1);
    this.sprite = scene.add
      .image(x, y, 'items', this.info.frame)
      .setOrigin(0.5, 1)
      .setScale(ITEM_SCALE)
      .setDepth(y);

    if (spawn.kind === 'pop') {
      this.sprite.setScale(0);
      scene.tweens.add({ targets: this.sprite, scale: ITEM_SCALE, duration: 300, ease: 'Back.Out' });
    } else if (spawn.kind === 'toss') {
      this.toss(spawn.fromX, spawn.fromY);
    }
  }

  /** Arco do item saindo do baú até o chão, com um quique no final. */
  private toss(fromX: number, fromY: number) {
    this.landed = false;
    this.sprite.setPosition(fromX, fromY).setScale(ITEM_SCALE * 0.4).setDepth(25_000);
    this.shadow.setAlpha(0);
    this.glow?.setVisible(false);
    const arc = { t: 0 };
    this.scene.tweens.add({
      targets: arc,
      t: 1,
      duration: TOSS_TIME,
      onUpdate: () => {
        const t = arc.t;
        const lift = Math.sin(t * Math.PI) * 70;
        this.sprite.x = Phaser.Math.Linear(fromX, this.x, t);
        this.sprite.y = Phaser.Math.Linear(fromY, this.y - 6, t) - lift;
        this.sprite.setScale(ITEM_SCALE * (0.4 + 0.6 * Math.min(t * 2, 1)));
        this.shadow.setAlpha(t * 0.3);
      },
      onComplete: () => {
        this.sprite.setDepth(this.y);
        this.glow?.setVisible(true);
        this.scene.tweens.add({
          targets: this.sprite,
          y: this.y - 20,
          duration: 120,
          yoyo: true,
          ease: 'Quad.Out',
          onComplete: () => (this.landed = true),
        });
      },
    });
  }

  update(time: number) {
    if (this.collected || !this.landed) return;
    const bob = (Math.sin(time / 300 + this.phase) + 1) / 2; // 0..1
    this.sprite.y = this.y - 6 - bob * 6;
    this.shadow.setScale(1 - bob * 0.2);
  }

  /** Lançado pela explosão: desliza (dx, dy) pelo chão com um pulo. */
  knock(dx: number, dy: number) {
    if (this.collected) return;
    this.landed = false;
    this.scene.tweens.killTweensOf(this.sprite);
    knockAlong(
      this.scene,
      this.x,
      this.y,
      dx,
      dy,
      (x, y, lift) => {
        if (this.collected) return;
        this.sprite.setPosition(x, y - 6 - lift).setDepth(y);
        this.shadow.setPosition(x, y).setDepth(y - 1).setScale(1 - lift / 120);
        this.glow?.setPosition(x, y - 2);
      },
      (x, y) => {
        if (this.collected) return;
        this.x = x;
        this.y = y;
        this.landed = true;
      },
    );
  }

  touches(px: number, py: number) {
    if (this.collected || this.scene.time.now < this.readyAt) return false;
    return Phaser.Math.Distance.Between(px, py, this.x, this.y) < PICKUP_RADIUS;
  }

  /** Sobe por cima da cabeça do gato e some (como no Isaac). */
  collect(overX: number, overY: number) {
    this.collected = true;
    this.shadow.destroy();
    this.glow?.destroy();
    this.sprite.setDepth(25_000);
    this.scene.tweens.killTweensOf(this.sprite);
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
