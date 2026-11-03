// Status do gato. Todos os multiplicadores começam em 1x e cada item soma STAT_STEP.

export const STAT_STEP = 0.2;
export const BASE_MAX_HP = 3;
/** Cada coração vale 2 pontos de vida; o dano padrão (1) tira meio coração. */
export const HP_PER_HEART = 2;

export type MultStat = 'damage' | 'speed' | 'fireRate' | 'shotSpeed' | 'size' | 'luck' | 'range';

/** Elementos dos itens que mudam a bola de pelo. */
export type Element = 'fire' | 'ice' | 'wind' | 'sand';
/** Efeito na bola: fogo + gelo viram água. */
export type ShotElement = Element | 'water';

export interface Stats extends Record<MultStat, number> {
  maxHp: number; // em corações inteiros
  /** Elementos pegos (pimenta, gelo, catavento, pedra). */
  elements: Element[];
}

export function newStats(): Stats {
  return { maxHp: BASE_MAX_HP, damage: 1, speed: 1, fireRate: 1, shotSpeed: 1, size: 1, luck: 1, range: 1, elements: [] };
}

/** Efeitos que a bola de pelo leva: fogo + gelo viram água; os outros se somam. */
export function shotElements(stats: Stats): ShotElement[] {
  const els = new Set<ShotElement>(stats.elements ?? []);
  if (els.has('fire') && els.has('ice')) {
    els.delete('fire');
    els.delete('ice');
    els.add('water');
  }
  return [...els];
}

/** Cor de cada efeito (bola de pelo e inimigo afetado). */
export const ELEMENT_COLOR: Record<ShotElement, number> = {
  fire: 0xff7a2a,
  ice: 0x9fdcff,
  wind: 0xe8f4ff,
  sand: 0xd8b46a,
  water: 0x4f9cff,
};

/** Ordem e nomes no painel de status. */
export const STAT_LABELS: [MultStat | 'maxHp', string][] = [
  ['maxHp', 'Vida'],
  ['damage', 'Dano'],
  ['speed', 'Velocidade'],
  ['fireRate', 'Cadência'],
  ['shotSpeed', 'Vel. tiro'],
  ['range', 'Alcance'],
  ['size', 'Tamanho'],
  ['luck', 'Sorte'],
];

/** 1.2 -> "1,2x" */
export function formatMult(v: number) {
  return `${v.toFixed(1).replace('.', ',')}x`;
}
