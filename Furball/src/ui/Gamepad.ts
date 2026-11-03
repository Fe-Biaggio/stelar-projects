import { Facing } from '../objects/Player';

// Controle físico (Gamepad API, layout padrão: Xbox/Android/Retroid Pocket).
// Analógico esquerdo ou direcional: andar. Analógico direito ou A/B/X/Y: atirar (como no Isaac).
// L1/L2: bomba. R1/R2: item usável. Start: início. Nos menus: direcional + A confirma, B volta.

export const BTN = {
  A: 0, // baixo
  B: 1, // direita
  X: 2, // esquerda
  Y: 3, // cima
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SELECT: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

const DEAD = 0.3;

export class PadInput {
  private cur: boolean[] = [];
  private prev: boolean[] = [];
  private axes: number[] = [];
  private prevDir = { x: 0, y: 0 };
  /** O controle foi usado nesta tela (para esconder os botões de toque). */
  used = false;

  /** Lê o controle; chame uma vez por quadro. */
  poll() {
    const pad = (navigator.getGamepads?.() ?? []).find((p) => p && p.connected);
    this.prev = this.cur;
    this.cur = pad ? pad.buttons.map((b) => b.pressed) : [];
    this.axes = pad ? [...pad.axes] : [];
    if (this.cur.some(Boolean) || this.axes.some((a) => Math.abs(a) > DEAD)) this.used = true;
  }

  down(b: number) {
    return !!this.cur[b];
  }

  /** Apertou agora (não estava apertado no quadro anterior). */
  pressed(b: number) {
    return !!this.cur[b] && !this.prev[b];
  }

  /** Direção de andar: direcional ou analógico esquerdo (componentes de -1 a 1). */
  get move() {
    const dx = (this.down(BTN.RIGHT) ? 1 : 0) - (this.down(BTN.LEFT) ? 1 : 0);
    const dy = (this.down(BTN.DOWN) ? 1 : 0) - (this.down(BTN.UP) ? 1 : 0);
    if (dx || dy) return { x: dx, y: dy };
    const x = this.axes[0] ?? 0;
    const y = this.axes[1] ?? 0;
    return Math.hypot(x, y) > DEAD ? { x, y } : { x: 0, y: 0 };
  }

  /** Direção do tiro: A/B/X/Y ou analógico direito. */
  get aim(): Facing | null {
    if (this.down(BTN.Y)) return 'up';
    if (this.down(BTN.A)) return 'down';
    if (this.down(BTN.X)) return 'left';
    if (this.down(BTN.B)) return 'right';
    const x = this.axes[2] ?? 0;
    const y = this.axes[3] ?? 0;
    if (Math.hypot(x, y) < 0.5) return null;
    return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
  }

  /** Para menus: direção apertada agora (direcional ou analógico, sem repetir enquanto segura). */
  menuDir(): 'up' | 'down' | 'left' | 'right' | null {
    const m = this.move;
    const dir = {
      x: Math.abs(m.x) > 0.5 ? Math.sign(m.x) : 0,
      y: Math.abs(m.y) > 0.5 ? Math.sign(m.y) : 0,
    };
    const fresh = dir.x !== this.prevDir.x || dir.y !== this.prevDir.y;
    this.prevDir = dir;
    if (!fresh) return null;
    if (dir.y) return dir.y > 0 ? 'down' : 'up';
    if (dir.x) return dir.x > 0 ? 'right' : 'left';
    return null;
  }
}
