import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { PICKUP_FRAME, PickupKind } from '../pickups';
import { PlayerState } from '../run';
import { TouchControls } from './TouchControls';

// HUD de um gato: corações, moedas/bombas/chaves e o item usável (canto superior esquerdo).
// No multiplayer cada jogador vê só o próprio HUD: os objetos levam o dono (`markOwner`).

const HEARTS_PER_ROW = 8;
const HEART_GAP = 34;
const HEART_ROW_H = 30;

/** Marca um objeto (e o que tem dentro) como de um jogador: só ele vê no multiplayer. */
export function markOwner(obj: Phaser.GameObjects.GameObject, owner: number) {
  (obj as unknown as { __owner?: number }).__owner = owner;
  return obj;
}

/** Marca um objeto como só da tela local (não vai para os outros jogadores). */
export function markLocal(obj: Phaser.GameObjects.GameObject) {
  (obj as unknown as { __local?: boolean }).__local = true;
  return obj;
}

export class Hud {
  private hearts: Phaser.GameObjects.Image[] = [];
  private counters = new Map<PickupKind, Phaser.GameObjects.Text>();
  private counterIcons = new Map<PickupKind, Phaser.GameObjects.Image>();
  private goldenKeyIcon?: Phaser.GameObjects.Image;
  private heartRows = 1;
  private activeHud?: {
    box: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image;
    bar: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
  };

  /**
   * `visibleHere`: o HUD aparece na tela deste aparelho (false = é de um jogador remoto e só vai
   * para a tela dele).
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ps: PlayerState,
    private readonly getPlayer: () => Player | undefined,
    private readonly visibleHere: boolean,
    private readonly touch?: TouchControls,
  ) {
    this.createCounters();
    this.updateHearts(false);
    this.createActiveHud();
  }

  private own<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    markOwner(obj, this.ps.idx);
    if (!this.visibleHere) this.scene.cameras.main.ignore(obj);
    return obj;
  }

  private get hp() {
    return this.getPlayer()?.hp ?? this.ps.hp;
  }

  private get shield() {
    return this.getPlayer()?.shield ?? this.ps.shield;
  }

  private createCounters() {
    for (const kind of ['coin', 'bomb', 'key'] as PickupKind[]) {
      const { x, y } = this.counterPosition(kind);
      this.counterIcons.set(kind, this.own(this.scene.add.image(x, y, 'pickups', PICKUP_FRAME[kind]).setScale(0.5).setDepth(20_000)));
      this.counters.set(
        kind,
        this.own(
          this.scene.add
            .text(x + 16, y, '', { fontFamily: 'monospace', fontSize: '16px', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 4 })
            .setOrigin(0, 0.5)
            .setDepth(20_000),
        ),
      );
    }
    const keyPos = this.counterPosition('goldenKey');
    this.goldenKeyIcon = this.own(this.scene.add.image(keyPos.x, keyPos.y, 'pickups', PICKUP_FRAME.goldenKey).setScale(0.5).setDepth(20_000));
    this.updateCounters();
  }

  /**
   * Para onde cada coletável voa no HUD. Moedas, bombas e chaves vão para o contador
   * (a chave dourada fica ao lado das chaves); corações vão para o espaço que vão ocupar.
   */
  counterPosition(kind: PickupKind): { x: number; y: number } {
    const x = 38;
    const top = 70 + (this.heartRows - 1) * HEART_ROW_H; // desce se houver mais linhas de corações
    const gap = 24;
    switch (kind) {
      case 'coin':
        return { x, y: top };
      case 'bomb':
        return { x, y: top + gap };
      case 'key':
      case 'goldenKey':
        return { x, y: top + gap * 2 };
      case 'blueHeart':
        return this.heartSlot(this.ps.stats.maxHp + Math.floor(this.shield / 2), true);
      default:
        return this.heartSlot(Math.min(Math.floor(this.hp / 2), this.ps.stats.maxHp - 1), true);
    }
  }

  private heartSlot(i: number, center = false) {
    const x = 26 + (i % HEARTS_PER_ROW) * HEART_GAP;
    const y = 22 + Math.floor(i / HEARTS_PER_ROW) * HEART_ROW_H;
    return center ? { x: x + 16, y: y + 15 } : { x, y };
  }

  private layoutCounters() {
    for (const kind of ['coin', 'bomb', 'key'] as PickupKind[]) {
      const { x, y } = this.counterPosition(kind);
      this.counterIcons.get(kind)?.setPosition(x, y);
      this.counters.get(kind)?.setPosition(x + 16, y);
    }
    const g = this.counterPosition('goldenKey');
    this.goldenKeyIcon?.setPosition(g.x, g.y);
    if (this.activeHud) {
      const { x, y } = this.activeSlotPosition();
      this.activeHud.box.setPosition(x, y);
      this.activeHud.icon.setPosition(x, y - 1);
      this.activeHud.bar.setPosition(x - 20, y + 26);
      this.activeHud.label.setPosition(x + 28, y);
    }
  }

  updateCounters(bump?: PickupKind) {
    const inv = this.ps.inventory;
    const values: [PickupKind, number][] = [
      ['coin', inv.coins],
      ['bomb', inv.bombs],
      ['key', inv.keys],
    ];
    for (const [kind, value] of values) {
      const text = this.counters.get(kind)!;
      text.setText(String(value).padStart(2, '0'));
      if (bump === kind) {
        text.setScale(1.4);
        this.scene.tweens.add({ targets: text, scale: 1, duration: 200, ease: 'Back.Out' });
      }
    }
    this.goldenKeyIcon?.setVisible(inv.goldenKey);
    this.counterIcons.get('key')?.setVisible(!inv.goldenKey);
    if (bump === 'goldenKey' && this.goldenKeyIcon) {
      this.goldenKeyIcon.setScale(1.3);
      this.scene.tweens.add({ targets: this.goldenKeyIcon, scale: 0.5, duration: 300, ease: 'Back.Out' });
    }
  }

  private createActiveHud() {
    const { x, y } = this.activeSlotPosition();
    const box = this.own(this.scene.add.rectangle(x, y, 44, 44, 0x120e0c, 0.7).setStrokeStyle(2, 0x8a7a6a).setDepth(20_000));
    const icon = this.own(this.scene.add.image(x, y - 1, 'actives', 0).setScale(0.58).setDepth(20_001));
    const bar = this.own(this.scene.add.rectangle(x - 20, y + 26, 40, 5, 0xf2c879).setOrigin(0, 0.5).setDepth(20_001));
    const label = this.own(
      this.scene.add
        .text(x + 28, y, this.touch || this.ps.idx > 0 ? '' : 'Espaço', { fontFamily: 'monospace', fontSize: '11px', color: '#8a7a6a' })
        .setOrigin(0, 0.5)
        .setDepth(20_001),
    );
    this.activeHud = { box, icon, bar, label };
    this.updateActiveHud(false);
  }

  private activeSlotPosition() {
    const keyRow = this.counterPosition('key');
    return { x: 48, y: keyRow.y + 42 };
  }

  updateActiveHud(bump: boolean) {
    const hud = this.activeHud;
    if (!hud) return;
    const player = this.getPlayer();
    const item = player?.active;
    const charge = player?.activeCharge ?? 1;
    const visible = !!item;
    for (const o of [hud.box, hud.icon, hud.bar, hud.label]) o.setVisible(visible);
    this.touch?.setActive(item ? item.frame : null, charge >= 1);
    if (!item) return;
    hud.icon.setFrame(item.frame);
    const ready = charge >= 1;
    hud.bar.width = 40 * charge;
    hud.bar.setFillStyle(ready ? 0xf2c879 : 0x6a5a4a);
    hud.icon.setAlpha(ready ? 1 : 0.5);
    hud.box.setStrokeStyle(2, ready ? 0xf2c879 : 0x8a7a6a);
    if (bump) {
      hud.icon.setScale(0.8);
      this.scene.tweens.add({ targets: hud.icon, scale: 0.58, duration: 250, ease: 'Back.Out' });
    }
  }

  /**
   * Corações: primeiro os vermelhos (cheio, metade ou vazio, 2 pontos cada), depois os azuis do
   * escudo (cheio ou metade). Até 8 por linha.
   */
  updateHearts(animate: boolean) {
    const hp = this.hp;
    const shield = this.shield;
    const maxHp = this.ps.stats.maxHp;
    const frames: number[] = [];
    for (let i = 0; i < maxHp; i++) {
      const pts = Phaser.Math.Clamp(hp - i * 2, 0, 2);
      frames.push(pts >= 2 ? 0 : pts > 0 ? 2 : 1);
    }
    for (let i = 0; i < Math.ceil(shield / 2 - 1e-9); i++) {
      frames.push(shield - i * 2 >= 2 ? 3 : 4);
    }
    while (this.hearts.length > frames.length) {
      const heart = this.hearts.pop()!;
      if (animate) {
        this.scene.tweens.add({ targets: heart, scale: 0, alpha: 0, duration: 250, onComplete: () => heart.destroy() });
      } else heart.destroy();
    }
    frames.forEach((frame, i) => {
      let heart = this.hearts[i];
      if (!heart) {
        const pos = this.heartSlot(i);
        heart = this.own(this.scene.add.image(pos.x + 16, pos.y + 15, 'hearts', frame).setDepth(20_000));
        if (animate) {
          heart.setScale(0);
          this.scene.tweens.add({ targets: heart, scale: 1, duration: 300, ease: 'Back.Out' });
        }
        this.hearts.push(heart);
        return;
      }
      const before = Number(heart.frame.name);
      if (before === frame) return;
      heart.setFrame(frame);
      if (animate) {
        const lost = frame === 1 || (before === 0 && frame === 2) || (before === 3 && frame === 4);
        heart.setScale(lost ? 1.5 : 1.25);
        this.scene.tweens.add({ targets: heart, scale: 1, duration: 250, ease: 'Back.Out' });
      }
    });
    const rows = Math.max(1, Math.ceil(frames.length / HEARTS_PER_ROW));
    if (rows !== this.heartRows) {
      this.heartRows = rows;
      this.layoutCounters();
    }
  }
}
