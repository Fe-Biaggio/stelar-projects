// Status do gato. Todos os multiplicadores começam em 1x e cada item soma STAT_STEP.

export const STAT_STEP = 0.2;
export const BASE_MAX_HP = 3;

export type MultStat = 'damage' | 'speed' | 'fireRate' | 'shotSpeed' | 'size' | 'luck';

export interface Stats extends Record<MultStat, number> {
  maxHp: number; // em corações inteiros
}

export function newStats(): Stats {
  return { maxHp: BASE_MAX_HP, damage: 1, speed: 1, fireRate: 1, shotSpeed: 1, size: 1, luck: 1 };
}

/** Ordem e nomes no painel de status. */
export const STAT_LABELS: [keyof Stats, string][] = [
  ['maxHp', 'Vida'],
  ['damage', 'Dano'],
  ['speed', 'Velocidade'],
  ['fireRate', 'Cadência'],
  ['shotSpeed', 'Vel. tiro'],
  ['size', 'Tamanho'],
  ['luck', 'Sorte'],
];

/** 1.2 -> "1,2x" */
export function formatMult(v: number) {
  return `${v.toFixed(1).replace('.', ',')}x`;
}
