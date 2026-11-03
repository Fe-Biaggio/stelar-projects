import Phaser from 'phaser';
import { BTN, PadInput } from '../ui/Gamepad';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { GameMode } from '../run';
import { drawRoom } from '../world/room';

interface ModeOption {
  mode: GameMode;
  title: string;
  detail: string;
}

const OPTIONS: ModeOption[] = [
  {
    mode: 'dev',
    title: 'Modo desenvolvedor',
    detail: 'Sala de testes com todos os itens, status, dano e chances do baú',
  },
  {
    mode: 'game',
    title: 'Jogar',
    detail: 'Mapa aleatório com inimigos, tesouro, loja e um boss por nível',
  },
];

const BOX_W = 520;
const BOX_H = 74;

/** Tela inicial: escolhe entre o modo desenvolvedor e o jogo para valer. */
export class TitleScene extends Phaser.Scene {
  private readonly pad = new PadInput();
  private index = 1;
  private boxes: Phaser.GameObjects.Container[] = [];
  private choosing = false;

  constructor() {
    super('Title');
  }

  init(data: { mode?: GameMode }) {
    this.index = data.mode === 'dev' ? 0 : 1;
    this.choosing = false;
  }

  create() {
    drawRoom(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setDepth(-10);
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210' };
    this.add
      .text(GAME_WIDTH / 2, 130, 'FURBALL', { ...style, fontSize: '72px', strokeThickness: 8, color: '#f2c879' })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 186, 'um roguelike de gatos', { ...style, fontSize: '18px', strokeThickness: 4, color: '#b8a898' })
      .setOrigin(0.5);

    this.boxes = OPTIONS.map((opt, i) => {
      const bg = this.add.graphics();
      const title = this.add
        .text(-BOX_W / 2 + 22, -14, opt.title, { ...style, fontSize: '24px', strokeThickness: 4 })
        .setOrigin(0, 0.5);
      const detail = this.add
        .text(-BOX_W / 2 + 22, 16, opt.detail, { fontFamily: 'monospace', fontSize: '13px', color: '#b8a898' })
        .setOrigin(0, 0.5);
      const box = this.add.container(GAME_WIDTH / 2, 276 + i * (BOX_H + 22), [bg, title, detail]);
      box.setSize(BOX_W, BOX_H).setInteractive({ useHandCursor: true });
      box.on('pointerover', () => this.select(i));
      box.on('pointerup', () => {
        this.select(i);
        this.choose();
      });
      return box;
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.select(0));
    kb.on('keydown-W', () => this.select(0));
    kb.on('keydown-DOWN', () => this.select(1));
    kb.on('keydown-S', () => this.select(1));
    kb.on('keydown-ENTER', () => this.choose());
    kb.on('keydown-SPACE', () => this.choose());

    this.select(this.index, true);
    this.cameras.main.fadeIn(250);
  }

  update() {
    this.pad.poll();
    const dir = this.pad.menuDir();
    if (dir === 'up') this.select(0);
    if (dir === 'down') this.select(1);
    if (this.pad.pressed(BTN.A) || this.pad.pressed(BTN.START)) this.choose();
  }

  private select(i: number, force = false) {
    if (this.choosing || (i === this.index && !force)) return;
    this.index = i;
    this.boxes.forEach((box, j) => {
      const on = j === i;
      const bg = box.list[0] as Phaser.GameObjects.Graphics;
      bg.clear();
      bg.fillStyle(on ? 0x3a2a1e : 0x1a1412, 0.92).fillRoundedRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H, 10);
      bg.lineStyle(3, on ? 0xf2c879 : 0x5a4a3c).strokeRoundedRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H, 10);
      if (on) {
        // Marcador de seleção: uma bolinha de pelo à esquerda
        bg.fillStyle(0x141111).fillCircle(-BOX_W / 2 - 22, 0, 10);
        bg.fillStyle(0x2a2524).fillCircle(-BOX_W / 2 - 22, 0, 8);
      }
      this.tweens.add({ targets: box, scale: on ? 1.03 : 1, duration: 120 });
    });
  }

  private choose() {
    if (this.choosing) return;
    this.choosing = true;
    const mode = OPTIONS[this.index].mode;
    this.cameras.main.fadeOut(200);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Select', { mode }));
  }
}
