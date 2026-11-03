import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { MAX_LEVEL, PlayerState, Run } from '../run';
import { RoomDef, neighbors } from '../world/floor';
import { inRect } from '../world/vsfloor';
import { markOwner } from './Hud';

// Mapa de um jogador: pequeno no canto superior direito, ou ampliado no meio da tela (meio
// transparente). Botão Y/R2 no controle, M no teclado ou um toque no mapa alterna.

const DEPTH = 40_000;

export class MapView {
  big = false;
  private parts: Phaser.GameObjects.GameObject[] = [];
  /** Área do mapa na tela (para o toque). */
  bounds = new Phaser.Geom.Rectangle();
  private blink = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly run: Run,
    private readonly ps: PlayerState,
    private readonly roomId: () => string,
    private readonly visibleHere: boolean,
    private readonly onTap?: () => void,
  ) {
    this.draw();
  }

  toggle() {
    this.big = !this.big;
    this.draw();
  }

  setBig(big: boolean) {
    if (this.big === big) return;
    this.big = big;
    this.draw();
  }

  private own<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    markOwner(obj, this.ps.idx);
    if (!this.visibleHere) this.scene.cameras.main.ignore(obj);
    this.parts.push(obj);
    return obj;
  }

  /** Salas que o jogador já visitou (no VS cada um tem as suas). */
  private visited(): Set<string> {
    const floor = this.run.floor;
    const list = this.run.mode === 'vs' ? (this.ps.seen ?? []) : Object.keys(this.run.rooms);
    const set = new Set(list.filter((id) => floor.rooms[id]));
    if (floor.rooms[this.roomId()]) set.add(this.roomId());
    return set;
  }

  /** Redesenha (chame quando trocar de sala, o tabuleiro encolher etc.). */
  draw() {
    for (const p of this.parts) p.destroy();
    this.parts = [];
    const floor = this.run.floor;
    const vs = this.run.vs;
    const visited = this.visited();
    const known = new Set(visited);
    for (const id of visited) for (const n of Object.values(neighbors(floor, id))) known.add(n!);
    const current = this.roomId();
    const cur = floor.rooms[current];

    // Que salas aparecem
    let rooms: RoomDef[];
    if (vs) {
      // VS: o tabuleiro inteiro aparece (sem revelar o que há nas salas)
      rooms = Object.values(floor.rooms);
      
    } else {
      rooms = [...known].map((id) => floor.rooms[id]).filter(Boolean);
    }
    if (!rooms.length && cur) rooms = [cur];
    if (!rooms.length) return;

    let minX = Math.min(...rooms.map((r) => r.gx));
    let maxX = Math.max(...rooms.map((r) => r.gx));
    let minY = Math.min(...rooms.map((r) => r.gy));
    let maxY = Math.max(...rooms.map((r) => r.gy));
    if (vs && this.big) {
      minX = 0;
      minY = 0;
      maxX = vs.w - 1;
      maxY = vs.h - 1;
    } else if (vs && cur) {
      // Mapa pequeno do VS: janela de 5x5 em volta do gato (sem passar da borda do tabuleiro)
      minX = Math.max(0, Math.min(cur.gx - 2, vs.w - 5));
      maxX = Math.min(vs.w - 1, minX + 4);
      minY = Math.max(0, Math.min(cur.gy - 2, vs.h - 5));
      maxY = Math.min(vs.h - 1, minY + 4);
    }
    const cols = maxX - minX + 1;
    const rows = maxY - minY + 1;

    let cw = 22;
    let ch = 15;
    let gap = 4;
    if (this.big) {
      // Cabe no meio da tela
      const scale = Math.min(720 / (cols * 26), 400 / (rows * 19), 2.6);
      cw = 22 * scale;
      ch = 15 * scale;
      gap = 4 * scale;
    }
    const w = cols * (cw + gap) + gap;
    const h = rows * (ch + gap) + gap;
    let left: number;
    let top: number;
    if (this.big) {
      left = (GAME_WIDTH - w) / 2;
      top = (GAME_HEIGHT - h) / 2 + 10;
      const bg = this.own(this.scene.add.rectangle(left - 14, top - 34, w + 28, h + 60, 0x0c0907, 0.55).setOrigin(0, 0).setDepth(DEPTH + 900));
      this.bounds.setTo(left - 14, top - 34, w + 28, h + 60);
      this.own(
        this.scene.add
          .text(GAME_WIDTH / 2, top - 20, vs ? 'Mapa' : `Mapa · nível ${this.run.level}/${MAX_LEVEL}`, {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#e8d9c4',
          })
          .setOrigin(0.5)
          .setDepth(DEPTH + 901),
      );
      this.makeTappable(bg);
    } else {
      const right = GAME_WIDTH - 20;
      top = 58;
      left = right - Math.max(w, 90);
      const bg = this.own(this.scene.add.rectangle(left - 6, top - 6, Math.max(w, 90) + 12, h + 30, 0x0c0907, 0.75).setOrigin(0, 0).setDepth(DEPTH));
      this.bounds.setTo(left - 6, top - 6, Math.max(w, 90) + 12, h + 30);
      this.makeTappable(bg);
    }
    const depth = this.big ? DEPTH + 901 : DEPTH + 1;
    const g = this.own(this.scene.add.graphics().setDepth(depth));
    const cell = (gx: number, gy: number) => ({ x: left + gap + (gx - minX) * (cw + gap), y: top + gap + (gy - minY) * (ch + gap) });
    const r = Math.max(3, cw * 0.18);

    for (const room of rooms) {
      if (room.gx < minX || room.gx > maxX || room.gy < minY || room.gy > maxY) continue;
      const { x, y } = cell(room.gx, room.gy);
      const isKnown = known.has(room.id);
      const color = room.id === current ? 0xf2e6cf : visited.has(room.id) ? 0x8a7a6a : isKnown ? 0x3a322e : 0x221c19;
      g.fillStyle(color, vs && !isKnown ? 0.8 : 1).fillRoundedRect(x, y, cw, ch, 3);
      // Ícones: tesouro, loja e boss (no VS as salas de item e de boss aparecem desde o começo)
      let icon = 0;
      if (vs) icon = room.item ? 0xe2b13c : room.type === 'boss' ? 0xd8302a : 0;
      else if (isKnown) icon = room.type === 'treasure' ? 0xe2b13c : room.type === 'shop' ? 0x7ad67a : room.type === 'boss' ? 0xd8302a : 0;
      if (icon && room.id !== current) {
        g.fillStyle(0x0c0907).fillCircle(x + cw / 2, y + ch / 2, r + 1);
        g.fillStyle(icon).fillCircle(x + cw / 2, y + ch / 2, r);
      }
    }

    if (vs) {
      // Área que vai ser destruída (aviso) e a sala que sobra no fim
      const next = vs.stages[vs.stage + 1];
      const now = vs.stages[vs.stage];
      if (next && this.warning) {
        g.lineStyle(Math.max(2, gap * 0.6), 0xff3030, 0.9);
        for (const room of rooms) {
          if (inRect(next, room.gx, room.gy) || !inRect(now, room.gx, room.gy)) continue;
          const { x, y } = cell(room.gx, room.gy);
          g.strokeRoundedRect(x, y, cw, ch, 3);
        }
      }
      const rw = now.x1 - now.x0 + 1;
      const rh = now.y1 - now.y0 + 1;
      if (rw * rh <= 4) {
        const [cx, cy] = vs.center;
        if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
          const { x, y } = cell(cx, cy);
          g.lineStyle(Math.max(2, gap * 0.7), 0x7ad6ff, 1).strokeRoundedRect(x - 2, y - 2, cw + 4, ch + 4, 4);
        }
      }
    } else if (!this.big) {
      this.own(
        this.scene.add
          .text(left, top + h + 4, `Nível ${this.run.level}/${MAX_LEVEL}`, { fontFamily: 'monospace', fontSize: '12px', color: '#b8a898' })
          .setDepth(DEPTH + 1),
      );
    }
  }

  /** Está no aviso dos 10 s antes de o tabuleiro encolher (o mapa pisca as salas condenadas). */
  warning = false;

  /** Pisca o aviso no mapa (chamado pela sala a cada quadro durante o alarme). */
  tick(dt: number) {
    if (!this.warning) return;
    this.blink += dt;
    if (this.blink > 0.5) {
      this.blink = 0;
      this.draw();
    }
  }

  private makeTappable(bg: Phaser.GameObjects.Rectangle) {
    if (!this.visibleHere || !this.onTap) return;
    bg.setInteractive();
    bg.on('pointerdown', () => this.onTap?.());
  }
}
