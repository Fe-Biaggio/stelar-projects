import { STAT_STEP, Stats } from './stats';

// Itens coletáveis. O frame é a posição em public/assets/items.png (tools/extract_items.py).

export type ItemId = 'can' | 'catnip' | 'brush' | 'churu' | 'yarn' | 'fish' | 'milk';

export interface ItemInfo {
  id: ItemId;
  name: string;
  /** Texto curto mostrado ao pegar o item. */
  effect: string;
  frame: number;
  stat: keyof Stats;
}

const plus = `+${String(STAT_STEP).replace('.', ',')}x`;

export const ITEMS: Record<ItemId, ItemInfo> = {
  can: { id: 'can', name: 'Comida enlatada', effect: 'Vida +1 coração', frame: 0, stat: 'maxHp' },
  catnip: { id: 'catnip', name: 'Catnip', effect: `Velocidade ${plus}`, frame: 1, stat: 'speed' },
  brush: { id: 'brush', name: 'Escovinha', effect: `Cadência ${plus}`, frame: 2, stat: 'fireRate' },
  churu: { id: 'churu', name: 'Churu', effect: `Sorte ${plus}`, frame: 3, stat: 'luck' },
  yarn: { id: 'yarn', name: 'Bolinha de lã', effect: `Velocidade do tiro ${plus}`, frame: 4, stat: 'shotSpeed' },
  fish: { id: 'fish', name: 'Peixe fresco', effect: `Dano ${plus}`, frame: 5, stat: 'damage' },
  milk: { id: 'milk', name: 'Leitinho', effect: `Bola de pelo maior ${plus}`, frame: 6, stat: 'size' },
};

/** Aplica o efeito do item nos status. A vida é tratada pelo Player (ganha e cura 1 coração). */
export function applyItem(stats: Stats, item: ItemInfo) {
  if (item.stat === 'maxHp') stats.maxHp += 1;
  else stats[item.stat] = Math.round((stats[item.stat] + STAT_STEP) * 10) / 10;
}
