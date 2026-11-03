import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { Facing } from '../objects/Player';

const DEPTH = 45_000;
const STICK_RADIUS = 62; // até onde o polegar arrasta o analógico
const DEAD_ZONE = 0.18;
const AIM_X = GAME_WIDTH - 118;
const AIM_Y = GAME_HEIGHT - 118;
const AIM_GAP = 58; // distância dos botões de tiro até o centro do losango
const AIM_SIZE = 25; // raio de cada botão de tiro
const BOMB_X = GAME_WIDTH - 250;
const BOMB_Y = GAME_HEIGHT - 66;

const AIM_OFFSETS: Record<Facing, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** O jogo está rodando num aparelho com tela de toque? */
export function isTouchDevice(scene: Phaser.Scene) {
  return scene.sys.game.device.input.touch;
}

/**
 * Controles na tela para celular:
 *  - analógico flutuante na metade esquerda (aparece onde o polegar encosta) para andar;
 *  - 4 botões de tiro em losango no canto direito (como as setas);
 *  - botão de bomba ao lado.
 * Funciona com vários dedos ao mesmo tempo.
 */
export class TouchControls {
  /** Direção de movimento, com componentes entre -1 e 1 (analógico). */
  readonly move = new Phaser.Math.Vector2();
  private stickPointer?: number;
  private readonly stickBase: Phaser.GameObjects.Arc;
  private readonly stickKnob: Phaser.GameObjects.Arc;
  private readonly stickHome = { x: 150, y: GAME_HEIGHT - 120 };
  /** Botões de tiro pressionados, com o momento em que foram tocados (o último manda). */
  private readonly aimHeld = new Map<number, { dir: Facing; at: number }>();
  private readonly aimButtons = new Map<Facing, Phaser.GameObjects.Container>();

  constructor(
    private readonly scene: Phaser.Scene,
    onBomb: () => void,
  ) {
    scene.input.addPointer(3); // até 4 dedos ao mesmo tempo

    // Analógico (fica parado num canto até ser tocado)
    this.stickBase = scene.add
      .circle(this.stickHome.x, this.stickHome.y, STICK_RADIUS + 8, 0x000000, 0.25)
      .setStrokeStyle(3, 0xe8d9c4, 0.35)
      .setDepth(DEPTH);
    this.stickKnob = scene.add
      .circle(this.stickHome.x, this.stickHome.y, 30, 0xe8d9c4, 0.4)
      .setStrokeStyle(3, 0x1a1210, 0.5)
      .setDepth(DEPTH + 1);

    // Botões de tiro
    for (const dir of Object.keys(AIM_OFFSETS) as Facing[]) {
      const [ox, oy] = AIM_OFFSETS[dir];
      const bg = scene.add.circle(0, 0, AIM_SIZE, 0x000000, 0.3).setStrokeStyle(3, 0xe8d9c4, 0.45);
      const arrow = scene.add.triangle(0, 0, 0, -9, 9, 7, -9, 7, 0xe8d9c4, 0.75).setAngle({ up: 0, right: 90, down: 180, left: 270 }[dir]);
      const button = scene.add.container(AIM_X + ox * AIM_GAP, AIM_Y + oy * AIM_GAP, [bg, arrow]).setDepth(DEPTH);
      this.aimButtons.set(dir, button);
    }

    // Botão de bomba
    const bombBg = scene.add.circle(0, 0, 30, 0x000000, 0.3).setStrokeStyle(3, 0xe8d9c4, 0.45);
    const bombIcon = scene.add.image(0, 4, 'pickups', 1).setScale(0.62);
    const bomb = scene.add.container(BOMB_X, BOMB_Y, [bombBg, bombIcon]).setDepth(DEPTH);
    bomb.setSize(70, 70).setInteractive();
    bomb.on('pointerdown', () => {
      onBomb();
      scene.tweens.add({ targets: bomb, scale: 0.85, duration: 70, yoyo: true });
    });

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
    });
  }

  /** Direção do tiro enquanto um botão de tiro está pressionado (o último tocado manda). */
  get aim(): Facing | null {
    let best: { dir: Facing; at: number } | null = null;
    for (const held of this.aimHeld.values()) if (!best || held.at > best.at) best = held;
    return best?.dir ?? null;
  }

  private aimAt(x: number, y: number): Facing | null {
    for (const [dir, b] of this.aimButtons) {
      if (Phaser.Math.Distance.Between(x, y, b.x, b.y) < AIM_SIZE + 14) return dir;
    }
    return null;
  }

  private onDown(p: Phaser.Input.Pointer) {
    const aim = this.aimAt(p.x, p.y);
    if (aim) {
      this.aimHeld.set(p.id, { dir: aim, at: this.scene.time.now });
      this.highlight();
      return;
    }
    // Metade esquerda (abaixo dos botões do topo): analógico nasce onde o dedo encostou
    if (this.stickPointer === undefined && p.x < GAME_WIDTH / 2 && p.y > 90) {
      this.stickPointer = p.id;
      this.stickBase.setPosition(p.x, p.y);
      this.stickKnob.setPosition(p.x, p.y);
      this.stickBase.setAlpha(1);
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id === this.stickPointer) {
      const dx = p.x - this.stickBase.x;
      const dy = p.y - this.stickBase.y;
      const len = Math.hypot(dx, dy);
      const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
      this.stickKnob.setPosition(this.stickBase.x + dx * k, this.stickBase.y + dy * k);
      const strength = Math.min(len / STICK_RADIUS, 1);
      if (strength < DEAD_ZONE) this.move.set(0, 0);
      else this.move.set((dx / len) * strength, (dy / len) * strength);
      return;
    }
    // Arrastar o dedo entre os botões de tiro troca a direção
    if (this.aimHeld.has(p.id) && p.isDown) {
      const aim = this.aimAt(p.x, p.y);
      const held = this.aimHeld.get(p.id)!;
      if (aim && aim !== held.dir) {
        this.aimHeld.set(p.id, { dir: aim, at: this.scene.time.now });
        this.highlight();
      }
    }
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id === this.stickPointer) {
      this.stickPointer = undefined;
      this.move.set(0, 0);
      this.stickBase.setPosition(this.stickHome.x, this.stickHome.y);
      this.stickKnob.setPosition(this.stickHome.x, this.stickHome.y);
    }
    if (this.aimHeld.delete(p.id)) this.highlight();
  }

  private highlight() {
    const active = this.aim;
    for (const [dir, b] of this.aimButtons) b.setScale(dir === active ? 1.15 : 1).setAlpha(dir === active ? 1 : 0.85);
  }
}
