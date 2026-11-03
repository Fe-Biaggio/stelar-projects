import Phaser from 'phaser';
import { FLOOR, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { Facing } from '../objects/Player';
import { RemoteInput } from '../net/session';
import { DoorSide } from '../world/room';

// Bot simples do multiplayer: ocupa a vaga de um jogador e joga sozinho (sem ser muito bom).
// Mira alinhando com o alvo, foge quando fica perto demais, segue o parceiro no co-op e anda
// de sala em sala no VS (de preferência rumo ao centro do tabuleiro).

/** O que o bot enxerga da sala. */
export interface BotView {
  me: { x: number; y: number };
  /** Alvos: inimigos e, no VS, os outros gatos da sala. */
  targets: { x: number; y: number }[];
  /** Parceiro para seguir (co-op). */
  friend?: { x: number; y: number };
  /** Portas abertas (sem combate), com a "nota" de cada uma (maior = melhor). */
  doors: { side: DoorSide; score: number }[];
  vs: boolean;
  combat: boolean;
  /** Próximo ponto do caminho até `to`, desviando dos obstáculos. */
  step: (to: { x: number; y: number }) => { x: number; y: number };
  /** O tiro passa daqui até `to` sem bater em pedra ou fogueira? */
  clear: (to: { x: number; y: number }) => boolean;
}

const ALIGN = 30; // px: alinhado o bastante para atirar
const TOO_CLOSE = 150;
const THINK = 0.18; // s entre decisões (o bot reage com atraso, de propósito)

const DOOR_POINT: Record<DoorSide, { x: number; y: number; push: [number, number] }> = {
  left: { x: FLOOR.x + 10, y: GAME_HEIGHT / 2 + 10, push: [-1, 0] },
  right: { x: FLOOR.x + FLOOR.width - 10, y: GAME_HEIGHT / 2 + 10, push: [1, 0] },
  up: { x: GAME_WIDTH / 2, y: FLOOR.y + 10, push: [0, -1] },
  down: { x: GAME_WIDTH / 2, y: FLOOR.y + FLOOR.height - 4, push: [0, 1] },
};

export class BotBrain {
  private input: RemoteInput = { mx: 0, my: 0, aim: null, fire: false, bomb: 0, item: 0, map: 0 };
  private thinkIn = 0;
  private door?: DoorSide;
  private doorTime = 0;
  private stuckTime = 0;
  private dodge?: [number, number];
  private dodgeTime = 0;
  private last = { x: 0, y: 0 };
  private itemIn = 4;
  private strafe = 1;
  /** Segundos sem conseguir atirar no alvo (alinhado e com caminho livre). */
  private noShot = 0;

  think(v: BotView, dt: number): RemoteInput {
    this.thinkIn -= dt;
    this.dodgeTime -= dt;
    this.itemIn -= dt;
    // Preso (andando sem sair do lugar): dá um passo de lado por um tempinho
    const moving = this.input.mx || this.input.my;
    const moved = Math.hypot(v.me.x - this.last.x, v.me.y - this.last.y);
    this.last = { ...v.me };
    this.stuckTime = moving && moved < 40 * dt ? this.stuckTime + dt : 0;
    if (this.stuckTime > 0.5) {
      this.stuckTime = 0;
      const side = Math.random() < 0.5 ? 1 : -1;
      this.dodge = this.input.mx ? [0, side] : [side, 0];
      if (Math.random() < 0.3) this.dodge = [-this.input.mx, -this.input.my];
      this.dodgeTime = 0.5;
    }
    if (this.thinkIn > 0) return this.input;
    this.thinkIn = THINK + Math.random() * 0.1;

    let mx = 0;
    let my = 0;
    let aim: Facing | null = null;
    const target = nearest(v.me, v.targets);
    if (target) {
      const dx = target.x - v.me.x;
      const dy = target.y - v.me.y;
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dy) < ALIGN) aim = dx > 0 ? 'right' : 'left';
      else if (Math.abs(dx) < ALIGN) aim = dy > 0 ? 'down' : 'up';
      const canShoot = !!aim && dist < 420 && v.clear(target);
      this.noShot = canShoot ? 0 : this.noShot + THINK;
      // Sem conseguir atirar faz tempo (inimigo encalhado atrás de pedra): aceita chegar mais perto
      if (dist < (this.noShot > 3 ? 70 : TOO_CLOSE)) {
        // Perto demais: se afasta
        mx = -Math.sign(dx);
        my = -Math.sign(dy);
      } else if (this.noShot > 3) {
        // Faz tempo que não consegue atirar (pedra no meio, longe demais): vai até o alvo
        [mx, my] = toward(v.me, v.step(target));
      } else if (!canShoot) {
        // Vai para a linha ou a coluna do alvo (a mais perto), contornando os obstáculos
        const row = { x: v.me.x, y: target.y };
        const col = { x: target.x, y: v.me.y };
        const spot = aim || Math.abs(dy) < Math.abs(dx) ? row : col;
        [mx, my] = toward(v.me, v.step(aim ? target : spot));
      } else {
        // Já alinhado: anda um pouco de lado para não ficar parado
        if (Math.random() < 0.15) this.strafe = -this.strafe;
        if (aim === 'left' || aim === 'right') my = this.strafe * 0.4;
        else mx = this.strafe * 0.4;
      }
      // Erra a mira de vez em quando
      if (aim && Math.random() < 0.12) aim = null;
      if (v.combat && this.itemIn <= 0) {
        this.itemIn = 5 + Math.random() * 5;
        this.input.item++;
      }
      this.door = undefined;
    } else if (v.friend && !v.vs) {
      // Co-op: acompanha o parceiro
      if (Math.hypot(v.friend.x - v.me.x, v.friend.y - v.me.y) > 110) [mx, my] = toward(v.me, v.step(v.friend));
    } else if (v.doors.length) {
      // Sala vazia: vai para uma porta (troca de ideia se demorar demais)
      this.doorTime -= THINK;
      if (!this.door || !v.doors.some((d) => d.side === this.door) || this.doorTime <= 0) {
        this.door = pickDoor(v.doors);
        this.doorTime = 8;
      }
      const p = DOOR_POINT[this.door];
      if (Math.hypot(p.x - v.me.x, p.y - v.me.y) < 50) [mx, my] = p.push;
      else [mx, my] = toward(v.me, v.step(p));
    }
    if (this.dodgeTime > 0 && this.dodge) [mx, my] = this.dodge;
    this.input = { ...this.input, mx: round(mx), my: round(my), aim, fire: false };
    return this.input;
  }
}

/** Direção (normalizada) de `from` até `to`. */
function toward(from: { x: number; y: number }, to: { x: number; y: number }): [number, number] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const n = Math.hypot(dx, dy) || 1;
  return [dx / n, dy / n];
}

function round(n: number) {
  return Math.round(Phaser.Math.Clamp(n, -1, 1) * 100) / 100;
}

function nearest(me: { x: number; y: number }, list: { x: number; y: number }[]) {
  let best: { x: number; y: number } | undefined;
  let bestD = Infinity;
  for (const t of list) {
    const d = Math.hypot(t.x - me.x, t.y - me.y);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** Sorteia uma porta, com mais chance para as de nota maior. */
function pickDoor(doors: { side: DoorSide; score: number }[]): DoorSide {
  const sorted = [...doors].sort((a, b) => b.score - a.score);
  return Math.random() < 0.75 ? sorted[0].side : sorted[Math.floor(Math.random() * sorted.length)].side;
}
