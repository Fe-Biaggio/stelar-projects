// Raridade dos itens e chances do baú, que melhoram com a sorte.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic'];

export const RARITY_INFO: Record<Rarity, { name: string; color: string; glow: number }> = {
  common: { name: 'Comum', color: '#d8d0c4', glow: 0xd8d0c4 },
  uncommon: { name: 'Incomum', color: '#7ad67a', glow: 0x5ccf5c },
  rare: { name: 'Raro', color: '#62adff', glow: 0x3d8fff },
  epic: { name: 'Épico', color: '#c584ff', glow: 0xb060ff },
};

/** Chances (em %) com sorte 1x. */
const BASE = { common: 50, uncommon: 30, rare: 15, epic: 5 };
/** Nenhuma raridade cai abaixo disso. */
export const MIN_ODDS = 10;

/**
 * Chances de cada raridade para uma sorte.
 *
 * A sorte multiplica as chances de épico, raro e incomum, e o comum fica com o resto.
 * Cada raridade pior para em 10%, uma de cada vez:
 *  1. o comum cai até 10% (sorte 1,8x);
 *  2. depois o incomum passa a ser o resto e cai até 10% (sorte 4x);
 *  3. depois o raro passa a ser o resto e cai até 10%, com o épico chegando a 70% (sorte 14x).
 */
export function rarityOdds(luck: number): Record<Rarity, number> {
  const l = Math.max(luck, 1);
  let epic = BASE.epic * l;
  let rare = BASE.rare * l;
  let uncommon = BASE.uncommon * l;
  let common = 100 - epic - rare - uncommon;
  if (common < MIN_ODDS) {
    common = MIN_ODDS;
    uncommon = 100 - common - epic - rare;
  }
  if (uncommon < MIN_ODDS) {
    uncommon = MIN_ODDS;
    rare = 100 - common - uncommon - epic;
  }
  if (rare < MIN_ODDS) {
    rare = MIN_ODDS;
    epic = 100 - common - uncommon - rare; // 70%
  }
  const round = (v: number) => Math.round(v * 10) / 10;
  return { common: round(common), uncommon: round(uncommon), rare: round(rare), epic: round(epic) };
}

export function rollRarity(luck: number, rng: () => number = Math.random): Rarity {
  const odds = rarityOdds(luck);
  let roll = rng() * 100;
  // Do melhor para o pior, para arredondamentos nunca favorecerem o comum.
  for (const r of [...RARITY_ORDER].reverse()) {
    if (roll < odds[r]) return r;
    roll -= odds[r];
  }
  return 'common';
}
