import { CatId } from './cats';
import { ItemId } from './items';
import { Inventory, PickupKind, newInventory } from './pickups';
import { HP_PER_HEART, Stats, newStats } from './stats';

// Estado de uma partida: o que precisa sobreviver quando o gato troca de sala.

export type RoomId = 'start' | 'treasure' | 'shop';

export interface FloorItem {
  id: ItemId;
  x: number;
  y: number;
  /** Itens da loja têm preço em moedas. */
  price?: number;
}

export interface FloorPickup {
  kind: PickupKind;
  x: number;
  y: number;
  tag?: string;
}

/** Marca de explosão no chão. */
export interface Scorch {
  x: number;
  y: number;
  seed: string;
}

export interface RoomState {
  /** Itens que ainda estão no chão desta sala. */
  items: FloorItem[];
  /** Moedas, bombas e chaves que ainda estão no chão. */
  pickups: FloorPickup[];
  /** Marcas de explosão no chão. */
  scorches?: Scorch[];
  /** Só na sala do tesouro. */
  chestOpen?: boolean;
}

export interface Run {
  cat: CatId;
  stats: Stats;
  /** Vida vermelha, em pontos (2 por coração). */
  hp: number;
  /** Escudo dos corações azuis, em pontos. Não se recupera. */
  shield: number;
  inventory: Inventory;
  /** Nível (andar) atual. A chave dourada só vale no nível em que foi pega. */
  level: number;
  /** Portas trancadas que já foram abertas neste nível, como "start:up". */
  unlocked: string[];
  rooms: Partial<Record<RoomId, RoomState>>;
}

export function newRun(cat: CatId): Run {
  const stats = newStats();
  return {
    cat,
    stats,
    hp: stats.maxHp * HP_PER_HEART,
    shield: 0,
    inventory: newInventory(),
    level: 1,
    unlocked: [],
    rooms: {},
  };
}

/**
 * Vai para o próximo nível (depois de derrotar o boss): mapa novo e a chave dourada é perdida.
 * Vida, status, moedas, bombas e chaves prateadas continuam.
 */
export function startNextLevel(run: Run) {
  run.level += 1;
  run.inventory.goldenKey = false;
  run.unlocked = [];
  run.rooms = {};
}
