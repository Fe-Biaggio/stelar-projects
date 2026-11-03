import { FLOOR, ROOM_COLS, ROOM_ROWS, TILE } from '../config';
import { DoorSide } from './room';

// Elementos das salas, numa grade de 13 x 7 tiles:
//  - pedra: bloqueia; quebra com bomba;
//  - buraco: bloqueia o gato e quem anda no chão (quem voa passa por cima);
//  - cadeira: o gato sobe; inimigos de chão desviam;
//  - mesa (2 tiles): só dá para subir a partir de uma cadeira; em cima dela, só inimigos que
//    voam alcançam o gato;
//  - fogueira: bloqueia e queima quem encosta; a bomba (ou uma bola molhada/congelada) apaga.

export type PropKind = 'rock' | 'hole' | 'chair' | 'table' | 'fire';

export interface Prop {
  kind: PropKind;
  col: number;
  row: number;
  /** Largura em tiles (a mesa ocupa 2). */
  w: number;
  /** Destruído por bomba (pedra, cadeira ou mesa): vira destroços e não bloqueia mais. */
  broken?: boolean;
  /** Fogueira: acertos de bola de pelo comum (apaga no 3º). */
  hits?: number;
}

/** Retângulo do prop no chão, em pixels. */
export function propRect(p: Prop) {
  return { x: FLOOR.x + p.col * TILE, y: FLOOR.y + p.row * TILE, w: p.w * TILE, h: TILE };
}

/** Tile (coluna, linha) de um ponto do chão. */
export function tileAt(x: number, y: number) {
  return {
    col: Math.floor((x - FLOOR.x) / TILE),
    row: Math.floor((y - FLOOR.y) / TILE),
  };
}

/** Centro de um tile, em pixels (y um pouco abaixo, onde ficam os pés). */
export function tileCenter(col: number, row: number) {
  return { x: FLOOR.x + (col + 0.5) * TILE, y: FLOOR.y + (row + 0.5) * TILE + 14 };
}

/** Bloqueia o gato andando no chão? (o gato sobe na cadeira; destroços não bloqueiam) */
export function blocksWalk(p: Prop) {
  return !p.broken && p.kind !== 'chair';
}

/** A bomba destrói este elemento? (buracos não) */
export function breakable(p: Prop) {
  return p.kind !== 'hole';
}

const CENTER_COL = Math.floor(ROOM_COLS / 2);
const CENTER_ROW = Math.floor(ROOM_ROWS / 2);

/** Tiles que ficam livres: entrada de cada porta e o centro (baú, recompensa, alçapão). */
function reservedCells(doors: DoorSide[]) {
  const cells = new Set<string>();
  const add = (c: number, r: number) => cells.add(`${c},${r}`);
  for (const side of doors) {
    if (side === 'left') [0, 1].forEach((c) => add(c, CENTER_ROW));
    if (side === 'right') [ROOM_COLS - 1, ROOM_COLS - 2].forEach((c) => add(c, CENTER_ROW));
    if (side === 'up') [0, 1].forEach((r) => add(CENTER_COL, r));
    if (side === 'down') [ROOM_ROWS - 1, ROOM_ROWS - 2].forEach((r) => add(CENTER_COL, r));
  }
  for (let c = CENTER_COL - 1; c <= CENTER_COL + 1; c++) add(c, CENTER_ROW);
  add(CENTER_COL, CENTER_ROW - 1);
  add(CENTER_COL, CENTER_ROW + 1);
  return cells;
}

/** Mapa de tiles ocupados, por "col,row". */
export function occupancy(props: Prop[]) {
  const grid = new Map<string, Prop>();
  for (const p of props) for (let i = 0; i < p.w; i++) grid.set(`${p.col + i},${p.row}`, p);
  return grid;
}

/** Todo tile onde o gato anda (chão ou cadeira) é alcançável a partir dos outros? */
function allConnected(props: Prop[]) {
  const grid = occupancy(props);
  const walkable = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= ROOM_COLS || r >= ROOM_ROWS) return false;
    const p = grid.get(`${c},${r}`);
    return !p || !blocksWalk(p);
  };
  const all: string[] = [];
  for (let r = 0; r < ROOM_ROWS; r++) for (let c = 0; c < ROOM_COLS; c++) if (walkable(c, r)) all.push(`${c},${r}`);
  const seen = new Set([all[0]]);
  const queue = [all[0]];
  while (queue.length) {
    const [c, r] = queue.shift()!.split(',').map(Number);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${c + dc},${r + dr}`;
      if (!seen.has(k) && walkable(c + dc, r + dr)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return seen.size === all.length;
}

/**
 * Sorteia os elementos de uma sala: 1 a 3 grupos entre pedras, buracos e móveis (mesa com
 * cadeiras). Só aceita arranjos que deixam as portas e o centro livres e tudo conectado.
 */
export function generateProps(doors: DoorSide[], rng: () => number = Math.random): Prop[] {
  const reserved = reservedCells(doors);
  const rand = (n: number) => Math.floor(rng() * n);
  for (let attempt = 0; attempt < 40; attempt++) {
    const props: Prop[] = [];
    const used = new Set<string>();
    const free = (c: number, r: number) =>
      c >= 0 && r >= 0 && c < ROOM_COLS && r < ROOM_ROWS && !used.has(`${c},${r}`) && !reserved.has(`${c},${r}`);
    const put = (kind: PropKind, c: number, r: number, w = 1) => {
      for (let i = 0; i < w; i++) used.add(`${c + i},${r}`);
      props.push({ kind, col: c, row: r, w });
    };
    /** Grupo que cresce a partir de um tile (pedras ou buracos). */
    const cluster = (kind: PropKind, size: number) => {
      let c = rand(ROOM_COLS);
      let r = rand(ROOM_ROWS);
      for (let i = 0; i < size; i++) {
        if (free(c, r)) put(kind, c, r);
        const [dc, dr] = [[1, 0], [-1, 0], [0, 1], [0, -1]][rand(4)];
        c += dc;
        r += dr;
      }
    };

    const groups = 1 + rand(3);
    let furniture = false;
    for (let g = 0; g < groups; g++) {
      const roll = rng();
      if (roll < 0.33) cluster('rock', 2 + rand(4));
      else if (roll < 0.55) cluster('hole', 1 + rand(3));
      else if (roll < 0.72) cluster('fire', 1 + rand(2));
      else if (!furniture) {
        // Mesa de 2 tiles com 1 ou 2 cadeiras encostadas
        const c = rand(ROOM_COLS - 1);
        const r = rand(ROOM_ROWS);
        if (!free(c, r) || !free(c + 1, r)) continue;
        put('table', c, r, 2);
        furniture = true;
        const spots = [[c - 1, r], [c + 2, r], [c, r + 1], [c + 1, r + 1], [c, r - 1], [c + 1, r - 1]].filter(([x, y]) => free(x, y));
        const chairs = Math.min(spots.length, 1 + rand(2));
        for (let i = 0; i < chairs; i++) {
          const [x, y] = spots.splice(rand(spots.length), 1)[0];
          put('chair', x, y);
        }
        if (chairs === 0) props.splice(props.findIndex((p) => p.kind === 'table'), 1); // mesa sem cadeira não serve
      } else cluster('rock', 2 + rand(3));
    }
    if (allConnected(props)) return props;
  }
  return [];
}

/** Sala fixa de testes do modo desenvolvedor, com um exemplo de cada elemento. */
export function devPropsLayout(): Prop[] {
  return [
    { kind: 'table', col: 2, row: 1, w: 2 },
    { kind: 'chair', col: 1, row: 1, w: 1 },
    { kind: 'chair', col: 3, row: 2, w: 1 },
    { kind: 'rock', col: 9, row: 1, w: 1 },
    { kind: 'rock', col: 10, row: 1, w: 1 },
    { kind: 'rock', col: 9, row: 2, w: 1 },
    { kind: 'hole', col: 2, row: 5, w: 1 },
    { kind: 'hole', col: 3, row: 5, w: 1 },
    { kind: 'hole', col: 9, row: 5, w: 1 },
    { kind: 'fire', col: 6, row: 1, w: 1 },
  ];
}
