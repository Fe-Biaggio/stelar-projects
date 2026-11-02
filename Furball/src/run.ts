import { CatId } from './cats';
import { ItemId } from './items';
import { Stats, newStats } from './stats';

// Estado de uma partida: o que precisa sobreviver quando o gato troca de sala.

export type RoomId = 'start' | 'treasure';

export interface FloorItem {
  id: ItemId;
  x: number;
  y: number;
}

export interface RoomState {
  /** Itens que ainda estão no chão desta sala. */
  items: FloorItem[];
  /** Só na sala do tesouro. */
  chestOpen?: boolean;
}

export interface Run {
  cat: CatId;
  stats: Stats;
  hp: number;
  rooms: Partial<Record<RoomId, RoomState>>;
}

export function newRun(cat: CatId): Run {
  const stats = newStats();
  return { cat, stats, hp: stats.maxHp, rooms: {} };
}
