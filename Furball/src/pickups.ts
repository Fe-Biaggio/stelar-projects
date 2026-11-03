// Coletáveis de inventário (como moedas, bombas e chaves do Isaac).
// O frame é a posição em public/assets/pickups.png (tools/extract_pickups.py).

export type PickupKind = 'coin' | 'bomb' | 'key' | 'goldenKey' | 'heart' | 'halfHeart' | 'blueHeart';

export const PICKUP_FRAME: Record<PickupKind, number> = {
  coin: 0,
  bomb: 1,
  key: 2,
  goldenKey: 3,
  heart: 4,
  halfHeart: 5,
  blueHeart: 6,
};

/** Corações do chão: quantos pontos de vida (ou de escudo) dão. */
export const HEART_POINTS: Partial<Record<PickupKind, number>> = { heart: 2, halfHeart: 1, blueHeart: 2 };

export function isHeart(kind: PickupKind) {
  return kind in HEART_POINTS;
}

export const MAX_COUNT = 99;

export interface Inventory {
  coins: number;
  bombs: number;
  keys: number;
  /** Chave dourada: abre todas as portas do mapa (quando houver portas trancadas). */
  goldenKey: boolean;
}

export function newInventory(): Inventory {
  return { coins: 0, bombs: 0, keys: 0, goldenKey: false };
}

/** Soma o coletável no inventário (corações não entram aqui: vão direto para a vida). */
export function addPickup(inv: Inventory, kind: PickupKind) {
  if (kind === 'coin') inv.coins = Math.min(inv.coins + 1, MAX_COUNT);
  else if (kind === 'bomb') inv.bombs = Math.min(inv.bombs + 1, MAX_COUNT);
  else if (kind === 'key') inv.keys = Math.min(inv.keys + 1, MAX_COUNT);
  else if (kind === 'goldenKey') inv.goldenKey = true;
}
