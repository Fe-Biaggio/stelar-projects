import { Rarity } from './rarity';
import { Element, MultStat, STAT_STEP, Stats } from './stats';

// Itens coletáveis. O frame é a posição em public/assets/items.png (tools/extract_items.py).

export type ItemId =
  | 'can'
  | 'catnip'
  | 'brush'
  | 'churu'
  | 'yarn'
  | 'fish'
  | 'milk'
  | 'collar'
  | 'paw'
  | 'vampire'
  | 'pepper'
  | 'ice'
  | 'pinwheel'
  | 'stone'
  | 'slingshot';

/** Efeito de um item usável (ativado com um botão, por um tempo). */
export interface ActiveEffect {
  effect: 'invincible' | 'doubleDamage';
  /** Quanto tempo o efeito dura (segundos). */
  duration: number;
  /** Quanto tempo para poder usar de novo (segundos). */
  recharge: number;
}

export interface ItemInfo {
  id: ItemId;
  name: string;
  /** Texto curto mostrado ao pegar o item. */
  effect: string;
  frame: number;
  /** Status que o item passivo aumenta (itens usáveis não têm). */
  stat?: MultStat | 'maxHp';
  rarity: Rarity;
  /** Folha de sprites do item ("items" para passivos, "actives" para usáveis). */
  texture?: 'items' | 'actives' | 'vampire' | 'elements';
  /** Item elemental: muda a bola de pelo. */
  element?: Element;
  /** Quanto o item soma no status (padrão: STAT_STEP = +0,2x). */
  amount?: number;
  /** Não sai em baús, lojas nem drops (recompensa especial). */
  hidden?: boolean;
  /** Itens usáveis: o que acontece ao apertar o botão. */
  active?: ActiveEffect;
}

const plus = `+${String(STAT_STEP).replace('.', ',')}x`;

export const ITEMS: Record<ItemId, ItemInfo> = {
  can: { id: 'can', name: 'Comida enlatada', effect: 'Vida +1 coração', frame: 0, stat: 'maxHp', rarity: 'rare' },
  catnip: { id: 'catnip', name: 'Catnip', effect: `Velocidade ${plus}`, frame: 1, stat: 'speed', rarity: 'common' },
  brush: { id: 'brush', name: 'Escovinha', effect: `Cadência ${plus}`, frame: 2, stat: 'fireRate', rarity: 'uncommon' },
  churu: { id: 'churu', name: 'Churu', effect: `Sorte ${plus}`, frame: 3, stat: 'luck', rarity: 'common' },
  yarn: { id: 'yarn', name: 'Bolinha de lã', effect: `Velocidade do tiro ${plus}`, frame: 4, stat: 'shotSpeed', rarity: 'common' },
  fish: { id: 'fish', name: 'Peixe fresco', effect: `Dano ${plus}`, frame: 5, stat: 'damage', rarity: 'epic' },
  milk: { id: 'milk', name: 'Leitinho', effect: `Bola de pelo maior ${plus}`, frame: 6, stat: 'size', rarity: 'uncommon' },
  // Itens usáveis (Espaço/Q ou o botão na tela)
  collar: {
    id: 'collar',
    name: 'Coleira',
    effect: 'Usável: imortal por 5 s',
    frame: 0,
    texture: 'actives',
    rarity: 'rare',
    active: { effect: 'invincible', duration: 5, recharge: 30 },
  },
  paw: {
    id: 'paw',
    name: 'Patinha',
    effect: 'Usável: dano 2x por 5 s',
    frame: 1,
    texture: 'actives',
    rarity: 'uncommon',
    active: { effect: 'doubleDamage', duration: 5, recharge: 20 },
  },
  // Recompensa do gatinho vampiro (doar 3 corações e ficar com meio coração)
  vampire: {
    id: 'vampire',
    name: 'Capa de vampiro',
    effect: 'Capa + 2 dentinhos: dano +1x',
    frame: 0,
    texture: 'vampire',
    stat: 'damage',
    amount: 1,
    rarity: 'epic',
    hidden: true,
  },
  // Itens elementais: a bola de pelo ganha um efeito (fogo + gelo = água)
  pepper: {
    id: 'pepper',
    name: 'Pimenta',
    effect: 'Bola de fogo: o inimigo pega fogo',
    frame: 0,
    texture: 'elements',
    element: 'fire',
    rarity: 'rare',
  },
  ice: {
    id: 'ice',
    name: 'Cubo de gelo',
    effect: 'Bola congelada: o inimigo para um instante',
    frame: 1,
    texture: 'elements',
    element: 'ice',
    rarity: 'rare',
  },
  pinwheel: {
    id: 'pinwheel',
    name: 'Catavento de mão',
    effect: 'Bola de vento: empurra muito mais',
    frame: 2,
    texture: 'elements',
    element: 'wind',
    rarity: 'uncommon',
  },
  stone: {
    id: 'stone',
    name: 'Pedra',
    effect: 'Bola de areia: o inimigo fica lento',
    frame: 3,
    texture: 'elements',
    element: 'sand',
    rarity: 'uncommon',
  },
  slingshot: {
    id: 'slingshot',
    name: 'Estilingue',
    effect: `Alcance ${plus}`,
    frame: 4,
    texture: 'elements',
    stat: 'range',
    rarity: 'common',
  },
};

/** Sorteia um item da raridade pedida. */
export function randomItemOf(rarity: Rarity, rng: () => number = Math.random): ItemId {
  const pool = Object.values(ITEMS).filter((i) => i.rarity === rarity && !i.hidden);
  return pool[Math.floor(rng() * pool.length)].id;
}

/** Aplica o efeito do item nos status. A vida é tratada pelo Player (ganha e cura 1 coração). */
export function applyItem(stats: Stats, item: ItemInfo) {
  if (item.element) {
    stats.elements ??= [];
    if (!stats.elements.includes(item.element)) stats.elements.push(item.element);
    return;
  }
  if (!item.stat) return; // itens usáveis não mexem nos status
  if (item.stat === 'maxHp') stats.maxHp += 1;
  else stats[item.stat] = Math.round((stats[item.stat] + (item.amount ?? STAT_STEP)) * 10) / 10;
}
