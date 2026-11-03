import { CatId } from './cats';
import { ItemId } from './items';
import { Inventory, PickupKind, newInventory } from './pickups';
import { HP_PER_HEART, Stats, newStats } from './stats';
import { FloorMap, devFloor, generateFloor } from './world/floor';
import { Prop } from './world/props';

// Estado de uma partida: o que precisa sobreviver quando o gato troca de sala.

/** "dev": sala de testes com painéis; "game": mapa aleatório com inimigos e boss. */
export type GameMode = 'dev' | 'game';

/** Identificador de uma sala no mapa ("x,y" na grade). */
export type RoomId = string;

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
  /** Inimigos já derrotados (as portas ficam abertas). */
  cleared?: boolean;
  /** Gatinho pedinte/vampiro: quantos itens já deu e se já foi embora. */
  npc?: { given: number; gone: boolean };
  /** Pedras, buracos e móveis da sala (sorteados na primeira visita). */
  props?: Prop[];
}

export interface Run {
  mode: GameMode;
  cat: CatId;
  stats: Stats;
  /** Vida vermelha, em pontos (2 por coração). */
  hp: number;
  /** Escudo dos corações azuis, em pontos. Não se recupera. */
  shield: number;
  inventory: Inventory;
  /** Pontos de vida doados ao gatinho vampiro na partida inteira. */
  bloodDonated: number;
  /** Já ganhou a capa de vampiro. */
  vampireReward: boolean;
  /** Item usável carregado (só um por vez) e quanto já recarregou (0 a 1). */
  active?: { id: ItemId; charge: number };
  /** Nível (andar) atual. A chave dourada só vale no nível em que foi pega. */
  level: number;
  /** Mapa do nível atual. */
  floor: FloorMap;
  /** Portas trancadas já abertas neste nível (ver doorKey em world/floor.ts). */
  unlocked: string[];
  /** Portas trancadas rachadas por uma bomba (a próxima bomba abre com certeza). */
  cracked: string[];
  /** Estado das salas já visitadas neste nível. */
  rooms: Record<RoomId, RoomState>;
}

export function newRun(cat: CatId, mode: GameMode = 'dev'): Run {
  const stats = newStats();
  const inventory = newInventory();
  if (mode === 'game') {
    // Como no Isaac, começa com uma bomba; e uma chave para a loja ou o baú.
    inventory.bombs = 1;
    inventory.keys = 1;
  }
  return {
    mode,
    cat,
    stats,
    hp: stats.maxHp * HP_PER_HEART,
    shield: 0,
    inventory,
    level: 1,
    floor: mode === 'game' ? generateFloor(1) : devFloor(),
    unlocked: [],
    cracked: [],
    rooms: {},
    bloodDonated: 0,
    vampireReward: false,
  };
}

/** Último nível: vencer o boss dele termina o jogo. */
export const MAX_LEVEL = 5;

/**
 * Vai para o próximo nível (depois de derrotar o boss): mapa novo e a chave dourada é perdida.
 * Vida, status, moedas, bombas e chaves prateadas continuam.
 */
export function startNextLevel(run: Run) {
  run.level += 1;
  run.inventory.goldenKey = false;
  run.unlocked = [];
  run.cracked = [];
  run.rooms = {};
  run.floor = generateFloor(run.level);
}
