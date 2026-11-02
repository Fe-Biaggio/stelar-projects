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
/** Chances (em %) com a sorte máxima. */
const BEST = { common: 0, uncommon: 0, rare: 70, epic: 30 };
/** Sorte em que as chances chegam ao máximo (10 churus de +0,2x). */
export const LUCK_FOR_BEST = 3;

/**
 * Chances de cada raridade para uma sorte. A sorte "tira" pontos primeiro do comum e,
 * quando ele chega a 0%, do incomum. Esses pontos vão para raro e épico, até 70% / 30%.
 */
export function rarityOdds(luck: number): Record<Rarity, number> {
  const t = Math.min(Math.max((luck - 1) / (LUCK_FOR_BEST - 1), 0), 1);
  const drained = (BASE.common + BASE.uncommon) * t; // pontos tirados dos itens piores
  const common = Math.max(BASE.common - drained, 0);
  const uncommon = Math.max(BASE.uncommon - Math.max(drained - BASE.common, 0), 0);
  const rare = BASE.rare + (BEST.rare - BASE.rare) * t;
  const epic = BASE.epic + (BEST.epic - BASE.epic) * t;
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
