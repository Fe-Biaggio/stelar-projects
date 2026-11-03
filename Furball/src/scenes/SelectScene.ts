import Phaser from 'phaser';
import { CATS, CatId, PLAYABLE } from '../cats';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { isTouchDevice } from '../ui/TouchControls';
import { drawRoom } from '../world/room';

const SPACING = 160;
const FEET_Y = 372;
const SCALE = 1.0;
const SCALE_SELECTED = 1.2;
const DIM = 0x7a7470;

interface Slot {
  id: CatId;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
}

/** Tela inicial: escolha do gato com ←/→ (ou A/D, ou mouse) e Enter para jogar. */
export class SelectScene extends Phaser.Scene {
  private slots: Slot[] = [];
  private index = 0;
  private nameText!: Phaser.GameObjects.Text;
  private arrow!: Phaser.GameObjects.Triangle;
  private starting = false;

  constructor() {
    super('Select');
  }

  init(data: { cat?: CatId }) {
    this.index = Math.max(0, PLAYABLE.indexOf(data.cat ?? 'black'));
    this.starting = false;
  }

  create() {
    drawRoom(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5).setDepth(-10);

    const touch = isTouchDevice(this);
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210' };
    this.add
      .text(GAME_WIDTH / 2, 118, 'FURBALL', { ...style, fontSize: '64px', strokeThickness: 8, color: '#f2c879' })
      .setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 172, 'Escolha seu gato', { ...style, fontSize: '22px', strokeThickness: 4 }).setOrigin(0.5);
    this.nameText = this.add
      .text(GAME_WIDTH / 2, FEET_Y + 44, '', { ...style, fontSize: '28px', strokeThickness: 5 })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 88, touch ? 'Toque para escolher  ·  toque de novo para jogar' : '← →  escolher     Enter  jogar', { ...style, fontSize: '18px', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0.8);

    this.slots = PLAYABLE.map((id, i) => {
      const x = GAME_WIDTH / 2 + (i - (PLAYABLE.length - 1) / 2) * SPACING;
      const shadow = this.add.ellipse(x, FEET_Y - 4, 64, 18, 0x000000, 0.4);
      const sprite = this.add.sprite(x, FEET_Y, `cat_${id}`, 0).setOrigin(0.5, 0.97).setScale(SCALE);
      sprite.setInteractive({ useHandCursor: true });
      if (touch) {
        // No toque: o primeiro toque escolhe, o segundo (no mesmo gato) começa.
        sprite.on('pointerup', () => {
          if (this.index !== i) this.select(i);
          else {
            this.goFullscreen();
            this.start();
          }
        });
      } else {
        sprite.on('pointerover', () => this.select(i));
        sprite.on('pointerdown', () => {
          this.select(i);
          this.start();
        });
      }
      return { id, sprite, shadow };
    });
    this.arrow = this.add.triangle(0, 0, 0, 0, 20, 0, 10, 14, 0xf2c879).setStrokeStyle(3, 0x1a1210);
    this.tweens.add({ targets: this.arrow, y: '+=6', duration: 400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    const kb = this.input.keyboard!;
    const prev = () => this.select((this.index + PLAYABLE.length - 1) % PLAYABLE.length);
    const next = () => this.select((this.index + 1) % PLAYABLE.length);
    kb.on('keydown-LEFT', prev);
    kb.on('keydown-A', prev);
    kb.on('keydown-RIGHT', next);
    kb.on('keydown-D', next);
    kb.on('keydown-ENTER', () => this.start());
    kb.on('keydown-SPACE', () => this.start());

    this.select(this.index, true);
    this.cameras.main.fadeIn(250);
  }

  private select(i: number, force = false) {
    if (this.starting || (i === this.index && !force)) return;
    this.index = i;
    this.slots.forEach((slot, j) => {
      const selected = j === i;
      this.tweens.killTweensOf(slot.sprite);
      slot.sprite.setY(FEET_Y).setAngle(0).setFrame(0);
      if (selected) {
        slot.sprite.clearTint();
        slot.shadow.setAlpha(0.5);
        this.tweens.add({ targets: slot.sprite, scale: SCALE_SELECTED, duration: 150, ease: 'Back.Out' });
        // Pulinhos de quem foi escolhido
        this.tweens.add({ targets: slot.sprite, y: FEET_Y - 10, duration: 260, yoyo: true, repeat: -1, ease: 'Quad.Out', delay: 150 });
      } else {
        slot.sprite.setTint(DIM).setScale(SCALE);
        slot.shadow.setAlpha(0.3);
      }
    });
    const chosen = this.slots[i];
    this.nameText.setText(CATS[chosen.id].name);
    this.nameText.setX(chosen.sprite.x);
    this.arrow.setPosition(chosen.sprite.x, FEET_Y - 128);
  }

  /** No celular, tenta tela cheia na horizontal (se o navegador permitir). */
  private goFullscreen() {
    if (this.scale.isFullscreen) return;
    try {
      this.scale.startFullscreen();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      orientation.lock?.('landscape').catch(() => undefined);
    } catch {
      // sem tela cheia: o jogo continua normalmente
    }
  }

  private start() {
    if (this.starting) return;
    this.starting = true;
    const chosen = this.slots[this.index];
    this.tweens.killTweensOf(chosen.sprite);
    chosen.sprite.setY(FEET_Y).setFrame(4); // boca aberta: "miau!"
    this.tweens.add({ targets: chosen.sprite, y: FEET_Y - 26, duration: 160, yoyo: true, ease: 'Quad.Out' });
    this.time.delayedCall(320, () => {
      this.cameras.main.fadeOut(250);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
        this.scene.start('Room', { cat: chosen.id }),
      );
    });
  }
}
