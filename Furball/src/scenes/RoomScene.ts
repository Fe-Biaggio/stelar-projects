import Phaser from 'phaser';
import { FLOOR, GAME_HEIGHT, GAME_WIDTH, TILE, WALL } from '../config';
import { CatId } from '../cats';
import { DummyCat } from '../objects/DummyCat';
import { ItemId } from '../items';
import { Furball, createFurballTexture } from '../objects/Furball';
import { ItemPickup } from '../objects/ItemPickup';
import { Facing, Player } from '../objects/Player';
import { STAT_LABELS, Stats, formatMult } from '../stats';
import { drawRoom } from '../world/room';

type MoveKeys = Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
type AimKeys = Record<Facing, Phaser.Input.Keyboard.Key>;

// Espinhos no chão para testar a vida (coluna, linha em tiles do chão).
const SPIKES: [number, number][] = [
  [2, 1],
  [10, 5],
];

// Itens de teste espalhados pela sala (id, coluna, linha em tiles do chão).
const TEST_ITEMS: [ItemId, number, number][] = [
  ['can', 4, 1],
  ['catnip', 6, 1],
  ['brush', 8, 1],
  ['churu', 10, 1],
  ['yarn', 2, 5],
  ['fish', 4, 5],
  ['milk', 8, 5],
];

export class RoomScene extends Phaser.Scene {
  private cat: CatId = 'black';
  private player!: Player;
  private dummy!: DummyCat;
  private moveKeys!: MoveKeys;
  private aimKeys!: AimKeys;
  private furballs: Furball[] = [];
  private spikeRects: Phaser.Geom.Rectangle[] = [];
  private hearts: Phaser.GameObjects.Image[] = [];
  private items: ItemPickup[] = [];
  private statTexts = new Map<keyof Stats, Phaser.GameObjects.Text>();
  private banner?: Phaser.GameObjects.Container;
  private hint?: Phaser.GameObjects.Text;
  private leaving = false;
  private readonly move = new Phaser.Math.Vector2();

  constructor() {
    super('Room');
  }

  init(data: { cat?: CatId }) {
    if (data.cat) this.cat = data.cat;
  }

  create() {
    this.leaving = false;
    this.furballs = [];
    this.spikeRects = [];
    this.items = [];
    this.hearts = [];
    this.banner = undefined;
    createFurballTexture(this, this.cat);
    drawRoom(this);
    this.drawSpikes();

    this.physics.world.setBounds(FLOOR.x, FLOOR.y, FLOOR.width, FLOOR.height);

    // Gato de teste parado no meio da sala.
    this.dummy = new DummyCat(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12, 'gray');

    this.player = new Player(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + TILE * 2.5, this.cat);
    this.physics.add.collider(this.player.body, this.dummy.body);
    this.player.on('hp', (hp: number, maxHp: number) => this.updateHearts(hp, maxHp, true));
    this.player.on('stats', (stats: Stats) => this.updateStats(stats));

    for (const [id, col, row] of TEST_ITEMS) {
      const x = FLOOR.x + (col + 0.5) * TILE;
      const y = FLOOR.y + (row + 0.5) * TILE + 14;
      this.items.push(new ItemPickup(this, x, y, id));
    }
    this.player.on('dead', () => this.showGameOver());

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.moveKeys = kb.addKeys({ w: K.W, a: K.A, s: K.S, d: K.D }) as MoveKeys;
    this.aimKeys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT }) as AimKeys;
    kb.addCapture([K.UP, K.DOWN, K.LEFT, K.RIGHT]); // não rolar a página com as setas
    kb.on('keydown-ESC', () => this.backToSelect());

    this.createHud();

    this.hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - WALL - 28, 'WASD para andar  ·  setas para atirar', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e8d9c4',
        stroke: '#1a1210',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0.85)
      .setDepth(10_000);

    if (this.game.renderer.type === Phaser.WEBGL) {
      this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.3);
    }
  }

  update(time: number, deltaMs: number) {
    // Limita o passo para a física não dar saltos se a aba ficar em segundo plano.
    const dt = Math.min(deltaMs, 50) / 1000;

    const k = this.moveKeys;
    this.move.set((k.d.isDown ? 1 : 0) - (k.a.isDown ? 1 : 0), (k.s.isDown ? 1 : 0) - (k.w.isDown ? 1 : 0));
    const aim = this.currentAim();

    if (this.hint && (this.move.lengthSq() > 0 || aim)) {
      const hint = this.hint;
      this.hint = undefined;
      this.tweens.add({ targets: hint, alpha: 0, duration: 800, delay: 2000, onComplete: () => hint.destroy() });
    }

    const shot = this.player.update(this.move, aim, dt, time);
    if (shot) {
      this.furballs.push(
        new Furball(this, this.cat, shot.x, shot.y, shot.dir, shot.height, shot.inherited, shot.stats),
      );
    }

    for (const f of this.furballs) {
      f.update(dt);
      const { x, y } = f.position;
      if (!f.dead && this.dummy.hits(x, y, f.hitRadius)) {
        const d = f.direction;
        f.burst();
        this.dummy.takeHit(d.x, d.y, f.damage);
      }
    }
    this.dummy.update(time);
    this.furballs = this.furballs.filter((f) => !f.dead);

    this.checkSpikes();
    this.checkItems(time);
  }

  private checkItems(time: number) {
    const feet = this.player.feet;
    for (const item of this.items) {
      item.update(time);
      if (!this.player.dead && item.touches(feet.x, feet.y)) {
        item.collect(feet.x, feet.y);
        this.player.collect(item.info);
        this.showBanner(item.info.name, item.info.effect);
      }
    }
    this.items = this.items.filter((i) => !i.collected);
  }

  /** A seta pressionada por último manda, como no Isaac. */
  private currentAim(): Facing | null {
    let best: Facing | null = null;
    let bestTime = -Infinity;
    for (const dir of Object.keys(this.aimKeys) as Facing[]) {
      const key = this.aimKeys[dir];
      if (key.isDown && key.timeDown > bestTime) {
        best = dir;
        bestTime = key.timeDown;
      }
    }
    return best;
  }

  private checkSpikes() {
    if (this.player.dead) return;
    const feet = this.player.body;
    const feetRect = new Phaser.Geom.Rectangle(feet.x, feet.y, feet.width, feet.height);
    for (const r of this.spikeRects) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(feetRect, r)) {
        this.player.takeDamage(1, r.centerX, r.centerY);
        return;
      }
    }
  }

  // ---------- HUD ----------

  private createHud() {
    this.updateHearts(this.player.hp, this.player.stats.maxHp, false);
    this.createMenuButton();
    this.createStatsPanel();
  }

  /** Painel pequeno com os status, abaixo do botão Início (para testes durante o desenvolvimento). */
  private createStatsPanel() {
    const right = GAME_WIDTH - 20;
    const top = 58;
    const lineH = 15;
    const w = 132;
    this.add
      .rectangle(right, top - 4, w, STAT_LABELS.length * lineH + 8, 0x120e0c, 0.6)
      .setOrigin(1, 0)
      .setDepth(40_000);
    this.statTexts.clear();
    STAT_LABELS.forEach(([key, label], i) => {
      const y = top + i * lineH;
      this.add
        .text(right - w + 8, y, label, { fontFamily: 'monospace', fontSize: '12px', color: '#b8a898' })
        .setDepth(40_001);
      this.statTexts.set(
        key,
        this.add
          .text(right - 8, y, '', { fontFamily: 'monospace', fontSize: '12px', color: '#e8d9c4' })
          .setOrigin(1, 0)
          .setDepth(40_001),
      );
    });
    this.updateStats(this.player.stats, false);
  }

  private updateStats(stats: Stats, flash = true) {
    for (const [key] of STAT_LABELS) {
      const text = this.statTexts.get(key)!;
      const value = key === 'maxHp' ? `${stats.maxHp}` : formatMult(stats[key]);
      if (flash && text.text !== value) {
        // Destaca em dourado o status que acabou de mudar
        text.setColor('#f2c879').setScale(1.25);
        this.tweens.add({ targets: text, scale: 1, duration: 300, ease: 'Back.Out' });
        this.time.delayedCall(1200, () => text.active && text.setColor('#e8d9c4'));
      }
      text.setText(value);
    }
  }

  /** Faixa no topo com o nome do item e o efeito, como no Isaac. */
  private showBanner(title: string, subtitle: string) {
    this.banner?.destroy();
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210' };
    const t1 = this.add.text(0, 0, title, { ...style, fontSize: '26px', strokeThickness: 6, color: '#f2c879' }).setOrigin(0.5);
    const t2 = this.add.text(0, 30, subtitle, { ...style, fontSize: '16px', strokeThickness: 4 }).setOrigin(0.5);
    const banner = this.add.container(GAME_WIDTH / 2, 110, [t1, t2]).setDepth(35_000).setAlpha(0);
    this.banner = banner;
    banner.y = 96;
    this.tweens.add({ targets: banner, alpha: 1, y: 110, duration: 200, ease: 'Quad.Out' });
    this.tweens.add({
      targets: banner,
      alpha: 0,
      delay: 1800,
      duration: 400,
      onComplete: () => banner.destroy(),
    });
  }

  /** Botão no canto superior direito que volta para a seleção de personagem. */
  private createMenuButton() {
    const w = 132;
    const h = 34;
    const x = GAME_WIDTH - 20 - w / 2;
    const y = 14 + h / 2;
    const bg = this.add.graphics();
    const draw = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? 0x5a4a3c : 0x2a2220, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(2, hover ? 0xf2c879 : 0x8a7a6a).strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    };
    draw(false);
    const label = this.add
      .text(0, 0, '↺ Início (Esc)', { fontFamily: 'monospace', fontSize: '15px', color: '#e8d9c4' })
      .setOrigin(0.5);
    const button = this.add.container(x, y, [bg, label]).setDepth(40_000).setSize(w, h);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerover', () => draw(true));
    button.on('pointerout', () => draw(false));
    button.on('pointerdown', () => this.backToSelect());
  }

  /** Volta para a tela de seleção, mantendo o gato atual pré-selecionado. */
  private backToSelect() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(200);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start('Select', { cat: this.cat }),
    );
  }

  private updateHearts(hp: number, maxHp: number, animate: boolean) {
    // Cria corações novos quando a vida máxima aumenta
    while (this.hearts.length < maxHp) {
      const heart = this.add
        .image(26 + this.hearts.length * 34, 22, 'hearts', 1)
        .setOrigin(0, 0)
        .setDepth(20_000);
      if (animate) {
        heart.setScale(0);
        this.tweens.add({ targets: heart, scale: 1, duration: 300, ease: 'Back.Out' });
      }
      this.hearts.push(heart);
    }
    this.hearts.forEach((heart, i) => {
      const wasFull = heart.frame.name === '0';
      const full = i < hp;
      heart.setFrame(full ? 0 : 1);
      if (animate && wasFull && !full) {
        heart.setScale(1.5);
        this.tweens.add({ targets: heart, scale: 1, duration: 250, ease: 'Back.Out' });
      }
    });
  }

  private showGameOver() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setDepth(30_000);
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 6 };
    const title = this.add
      .text(cx, cy - 20, 'Fim de jogo', { ...style, fontSize: '48px' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    const sub = this.add
      .text(cx, cy + 34, 'R para recomeçar  ·  Esc para trocar de gato', { ...style, fontSize: '20px', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    this.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 600, delay: 400 });
    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 600, delay: 600 });

    const kb = this.input.keyboard!;
    kb.once('keydown-R', () => this.scene.restart({ cat: this.cat }));
  }

  // ---------- Cenário ----------

  /** Placas de espinhos de metal; tocar nelas tira um coração. */
  private drawSpikes() {
    const g = this.add.graphics().setDepth(-50);
    for (const [col, row] of SPIKES) {
      const x = FLOOR.x + col * TILE;
      const y = FLOOR.y + row * TILE;
      g.fillStyle(0x000000, 0.25).fillRoundedRect(x + 4, y + 6, TILE - 6, TILE - 6, 6);
      g.fillStyle(0x3b3532).fillRoundedRect(x + 4, y + 4, TILE - 8, TILE - 8, 6);
      g.lineStyle(2, 0x171312).strokeRoundedRect(x + 4, y + 4, TILE - 8, TILE - 8, 6);
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          const sx = x + 16 + i * 16;
          const sy = y + 22 + j * 16;
          g.fillStyle(0x000000, 0.35).fillEllipse(sx, sy + 2, 12, 5);
          g.fillStyle(0x8f8984).fillTriangle(sx - 5, sy, sx + 5, sy, sx, sy - 14);
          g.fillStyle(0xd8d2cc).fillTriangle(sx - 2, sy - 1, sx, sy - 1, sx, sy - 12);
          g.lineStyle(1.5, 0x1d1917).strokeTriangle(sx - 5, sy, sx + 5, sy, sx, sy - 14);
        }
      }
      this.spikeRects.push(new Phaser.Geom.Rectangle(x + 10, y + 10, TILE - 20, TILE - 20));
    }
  }
}
