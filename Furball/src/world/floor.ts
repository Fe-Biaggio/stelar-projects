import { DoorSide } from './room';

// Mapa de um nível: salas numa grade, ligadas pelas portas dos lados (como no Isaac).

export type RoomType = 'devStart' | 'devProps' | 'devActives' | 'start' | 'normal' | 'treasure' | 'shop' | 'boss';

/** Baú numa sala comum: "wood" abre sem chave; "gold" precisa de chave. */
export type ChestKind = 'wood' | 'gold';

export interface RoomDef {
  id: string;
  gx: number;
  gy: number;
  type: RoomType;
  /** As portas que levam a esta sala começam trancadas (precisam de chave). */
  locked?: boolean;
  /** Sala comum com baú no meio. */
  chest?: ChestKind;
}

export interface FloorMap {
  rooms: Record<string, RoomDef>;
  startId: string;
}

const STEP: Record<DoorSide, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const roomKey = (gx: number, gy: number) => `${gx},${gy}`;

/** Salas vizinhas de uma sala, por lado. */
export function neighbors(floor: FloorMap, id: string): Partial<Record<DoorSide, string>> {
  const r = floor.rooms[id];
  const out: Partial<Record<DoorSide, string>> = {};
  for (const side of Object.keys(STEP) as DoorSide[]) {
    const [dx, dy] = STEP[side];
    const key = roomKey(r.gx + dx, r.gy + dy);
    if (floor.rooms[key]) out[side] = key;
  }
  return out;
}

/** Identificador de uma porta (o mesmo dos dois lados). */
export const doorKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Mapa fixo do modo desenvolvedor: sala de testes, tesouro à direita e loja trancada em cima. */
export function devFloor(): FloorMap {
  const rooms: Record<string, RoomDef> = {};
  const add = (gx: number, gy: number, type: RoomType, locked = false) => {
    const id = roomKey(gx, gy);
    rooms[id] = { id, gx, gy, type, locked };
  };
  add(0, 0, 'devStart');
  add(1, 0, 'treasure');
  add(0, -1, 'shop', true);
  add(-1, 0, 'devProps');
  add(0, 1, 'devActives');
  rooms[roomKey(-1, 0)].chest = 'wood';
  return { rooms, startId: roomKey(0, 0) };
}

/**
 * Gera um nível aleatório: as salas crescem a partir do início, sem formar blocos (cada sala
 * nova encosta em só uma sala existente). Nas pontas sem saída ficam o boss (a mais distante),
 * o tesouro e a loja (trancada).
 */
export function generateFloor(level: number, rng: () => number = Math.random): FloorMap {
  const target = Math.min(7 + level * 2, 15);
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells = new Map<string, [number, number]>([[roomKey(0, 0), [0, 0]]]);
    const count = (gx: number, gy: number) =>
      (Object.values(STEP) as [number, number][]).filter(([dx, dy]) => cells.has(roomKey(gx + dx, gy + dy))).length;

    let guard = 0;
    while (cells.size < target && guard++ < 2000) {
      const list = [...cells.values()];
      const [bx, by] = list[Math.floor(rng() * list.length)];
      const [dx, dy] = Object.values(STEP)[Math.floor(rng() * 4)] as [number, number];
      const nx = bx + dx;
      const ny = by + dy;
      if (cells.has(roomKey(nx, ny)) || Math.abs(nx) > 4 || Math.abs(ny) > 3) continue;
      if (count(nx, ny) > 1) continue; // evita blocos 2x2 e caminhos em círculo
      cells.set(roomKey(nx, ny), [nx, ny]);
    }
    if (cells.size < target) continue;

    // Distância (em salas) de cada sala até o início
    const dist = new Map<string, number>([[roomKey(0, 0), 0]]);
    const queue: [number, number][] = [[0, 0]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of Object.values(STEP) as [number, number][]) {
        const k = roomKey(x + dx, y + dy);
        if (cells.has(k) && !dist.has(k)) {
          dist.set(k, dist.get(roomKey(x, y))! + 1);
          queue.push([x + dx, y + dy]);
        }
      }
    }

    const deadEnds = [...cells.entries()]
      .filter(([k, [x, y]]) => k !== roomKey(0, 0) && count(x, y) === 1)
      .sort((a, b) => dist.get(b[0])! - dist.get(a[0])!);
    if (deadEnds.length < 3 || dist.get(deadEnds[0][0])! < 3) continue;

    const rooms: Record<string, RoomDef> = {};
    for (const [id, [gx, gy]] of cells) rooms[id] = { id, gx, gy, type: 'normal' };
    rooms[roomKey(0, 0)].type = 'start';
    rooms[deadEnds[0][0]].type = 'boss';
    // Tesouro e loja nas outras pontas, sorteadas
    const others = deadEnds.slice(1);
    const pick = () => others.splice(Math.floor(rng() * others.length), 1)[0][0];
    rooms[pick()].type = 'treasure';
    const shop = pick();
    rooms[shop].type = 'shop';
    rooms[shop].locked = true;
    // Salas comuns com baú: pelo menos 2 (3 a partir do nível 3); a primeira é sempre de madeira
    const normals = Object.values(rooms).filter((r) => r.type === 'normal');
    const chests = Math.min(normals.length, level >= 3 ? 3 : 2);
    for (let i = 0; i < chests; i++) {
      const room = normals.splice(Math.floor(rng() * normals.length), 1)[0];
      room.chest = i === 0 || rng() < 0.5 ? 'wood' : 'gold';
    }
    return { rooms, startId: roomKey(0, 0) };
  }
  // Muito improvável; volta para um mapa simples em linha
  const rooms: Record<string, RoomDef> = {};
  const types: RoomType[] = ['start', 'normal', 'normal', 'treasure', 'normal', 'boss'];
  types.forEach((type, i) => (rooms[roomKey(i, 0)] = { id: roomKey(i, 0), gx: i, gy: 0, type }));
  rooms[roomKey(1, -1)] = { id: roomKey(1, -1), gx: 1, gy: -1, type: 'shop', locked: true };
  return { rooms, startId: roomKey(0, 0) };
}
