import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { BTN, PadInput } from './Gamepad';

// Lista de opções para os menus (teclado, controle e toque). Opções com ◀ ▶ mudam um valor.

export interface MenuItem {
  label: () => string;
  detail?: () => string;
  action?: () => void;
  left?: () => void;
  right?: () => void;
  disabled?: () => boolean;
}

const STYLE = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210' };

export class MenuList {
  index = 0;
  private boxes: Phaser.GameObjects.Container[] = [];
  private readonly pad = new PadInput();
  /** B no controle / Esc no teclado. */
  onBack?: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private items: MenuItem[],
    private readonly x: number,
    private readonly top: number,
    private readonly w = 520,
    private readonly h = 56,
    private readonly gap = 12,
  ) {
    this.build();
    const kb = scene.input.keyboard!;
    const on = (k: string, f: () => void) => kb.on(`keydown-${k}`, f);
    on('UP', () => this.move(-1));
    on('W', () => this.move(-1));
    on('DOWN', () => this.move(1));
    on('S', () => this.move(1));
    on('LEFT', () => this.side(-1));
    on('A', () => this.side(-1));
    on('RIGHT', () => this.side(1));
    on('D', () => this.side(1));
    on('ENTER', () => this.activate());
    on('SPACE', () => this.activate());
    on('ESC', () => this.onBack?.());
  }

  /** Troca as opções (ex.: o modo mudou e aparecem outras configurações). */
  setItems(items: MenuItem[]) {
    this.items = items;
    this.index = Math.min(this.index, items.length - 1);
    this.build();
  }

  private build() {
    for (const b of this.boxes) b.destroy();
    this.boxes = this.items.map((item, i) => {
      const bg = this.scene.add.graphics();
      const title = this.scene.add
        .text(-this.w / 2 + 20, item.detail ? -10 : 0, '', { ...STYLE, fontSize: '20px', strokeThickness: 4 })
        .setOrigin(0, 0.5);
      const detail = this.scene.add
        .text(-this.w / 2 + 20, 14, '', { fontFamily: 'monospace', fontSize: '12px', color: '#b8a898' })
        .setOrigin(0, 0.5);
      const box = this.scene.add.container(this.x, this.top + i * (this.h + this.gap), [bg, title, detail]).setDepth(100);
      box.setSize(this.w, this.h).setInteractive({ useHandCursor: true });
      box.on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.select(i);
        // Opções de valor: tocar na metade esquerda diminui, na direita aumenta
        if (item.left || item.right) this.side(p.x < this.x ? -1 : 1);
        else this.activate();
      });
      return box;
    });
    this.refresh();
  }

  select(i: number) {
    if (i === this.index) return;
    this.index = i;
    this.refresh();
  }

  private move(d: number) {
    const n = this.items.length;
    this.index = (this.index + d + n) % n;
    playSfx('click');
    this.refresh();
  }

  private side(d: number) {
    const item = this.items[this.index];
    if (!item || item.disabled?.()) return;
    const f = d < 0 ? item.left : item.right;
    if (!f) return;
    f();
    playSfx('click');
    this.refresh();
  }

  activate() {
    const item = this.items[this.index];
    if (!item || item.disabled?.()) return;
    if (item.action) {
      playSfx('click');
      item.action();
    } else this.side(1);
    this.refresh();
  }

  /** Redesenha os rótulos e a seleção. */
  refresh() {
    this.boxes.forEach((box, j) => {
      if (!box.scene) return;
      const item = this.items[j];
      const on = j === this.index;
      const off = !!item.disabled?.();
      const [bg, title, detail] = box.list as [Phaser.GameObjects.Graphics, Phaser.GameObjects.Text, Phaser.GameObjects.Text];
      bg.clear();
      bg.fillStyle(on ? 0x3a2a1e : 0x1a1412, 0.92).fillRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 10);
      bg.lineStyle(3, on ? 0xf2c879 : 0x5a4a3c).strokeRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 10);
      const arrows = item.left || item.right;
      title.setText(arrows ? `◀  ${item.label()}  ▶` : item.label());
      title.setColor(off ? '#6a5a4a' : '#e8d9c4');
      detail.setText(item.detail?.() ?? '');
      box.setScale(on ? 1.02 : 1);
    });
  }

  /** Chame no update da cena (controle físico). */
  update() {
    this.pad.poll();
    const dir = this.pad.menuDir();
    if (dir === 'up') this.move(-1);
    if (dir === 'down') this.move(1);
    if (dir === 'left') this.side(-1);
    if (dir === 'right') this.side(1);
    if (this.pad.pressed(BTN.A) || this.pad.pressed(BTN.START)) this.activate();
    if (this.pad.pressed(BTN.B)) this.onBack?.();
  }
}

/** Fundo das telas de menu: a sala escurecida e um título. */
export function menuBackground(scene: Phaser.Scene, title: string, subtitle = '') {
  const { width, height } = scene.scale.gameSize;
  scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6).setDepth(-10);
  scene.add
    .text(width / 2, 60, title, { ...STYLE, fontSize: '44px', strokeThickness: 8, color: '#f2c879' })
    .setOrigin(0.5);
  return scene.add
    .text(width / 2, 104, subtitle, { fontFamily: 'monospace', fontSize: '15px', color: '#b8a898', align: 'center' })
    .setOrigin(0.5, 0);
}

/** Pede um texto (nome, código da sala). Simples: a caixa do navegador. */
export function askText(question: string, current = '', max = 12): string | null {
  const v = window.prompt(question, current);
  if (v === null) return null;
  return v.trim().slice(0, max);
}

export function savedName() {
  try {
    return localStorage.getItem('furball-name') || `Gato${Math.floor(100 + Math.random() * 900)}`;
  } catch {
    return `Gato${Math.floor(100 + Math.random() * 900)}`;
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem('furball-name', name);
  } catch {
    /* sem armazenamento */
  }
}
