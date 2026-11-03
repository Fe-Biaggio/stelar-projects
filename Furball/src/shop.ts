import { ITEMS, ItemId, randomItemOf } from './items';
import { Rarity, rollRarity } from './rarity';

// Loja: 3 itens sorteados (a sorte também ajuda aqui), com preço pela raridade.

export const SHOP_SIZE = 3;

export const PRICE_BY_RARITY: Record<Rarity, number> = {
  common: 3,
  uncommon: 5,
  rare: 8,
  epic: 12,
};

export function priceOf(id: ItemId) {
  return PRICE_BY_RARITY[ITEMS[id].rarity];
}

/** Sorteia itens para a loja, evitando repetir o mesmo item quando possível. */
export function rollShopItems(luck: number, count = SHOP_SIZE, avoid: ItemId[] = []): ItemId[] {
  const picked: ItemId[] = [];
  for (let i = 0; i < count; i++) {
    let id = randomItemOf(rollRarity(luck));
    for (let tries = 0; tries < 10 && (picked.includes(id) || avoid.includes(id)); tries++) {
      id = randomItemOf(rollRarity(luck));
    }
    picked.push(id);
  }
  return picked;
}
