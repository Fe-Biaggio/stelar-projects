import { FloorMap, RoomDef, roomKey } from './floor';

// Mapa do modo VS: um tabuleiro grande quase todo preenchido de salas, que encolhe com o tempo
// até sobrar só a sala do centro.

/** Retângulo de salas ainda de pé (inclusivo). */
export interface BoardRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface VsBoard {
  w: number;
  h: number;
  /** A sala que sobra no fim (sempre existe). */
  center: [number, number];
  /** Tamanhos do tabuleiro, do inteiro (0) até 1x1 no centro. */
  stages: BoardRect[];
  /** Etapa atual (índice em `stages`). */
  stage: number;
  /** Segundos desde o começo da partida. */
  elapsed: number;
  itemRooms: string[];
  bossRooms: string[];
  /** Sala onde cada jogador nasce. */
  spawns: string[];
}

/** A primeira redução acontece aos 5 minutos; depois, a cada 2 minutos. */
export const FIRST_SHRINK = 300;
export const NEXT_SHRINK = 120;
/** Aviso (alarme) antes de cada redução. */
export const SHRINK_WARNING = 10;

/** Momento (em segundos) em que a etapa `i` começa. */
export function stageTime(i: number) {
  return i <= 0 ? 0 : FIRST_SHRINK + (i - 1) * NEXT_SHRINK;
}

export function inRect(r: BoardRect, x: number, y: number) {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/** Tamanho recomendado do tabuleiro para o número de jogadores. */
export function recommendedSize(players: number): number {
  return players >= 4 ? 12 : players === 3 ? 10 : 8;
}

/**
 * Sequência de tamanhos: na 1ª redução somem as pontas do lado maior (os dois lados se for
 * quadrado: 12x12 vira 10x10; 12x4 vira 10x4). Depois sai uma linha ou coluna por vez, do lado
 * maior, a mais longe da sala do centro, até ficar 1x1.
 */
function buildStages(w: number, h: number, cx: number, cy: number): BoardRect[] {
  const stages: BoardRect[] = [{ x0: 0, y0: 0, x1: w - 1, y1: h - 1 }];
  let r = { ...stages[0] };
  const cut = (axis: 'x' | 'y', both: boolean) => {
    const lo = axis === 'x' ? 'x0' : 'y0';
    const hi = axis === 'x' ? 'x1' : 'y1';
    const c = axis === 'x' ? cx : cy;
    if (r[hi] - r[lo] < 1) return;
    if (both && r[hi] - r[lo] >= 2) {
      r[lo] += 1;
      r[hi] -= 1;
      return;
    }
    // Tira o lado mais longe do centro
    if (c - r[lo] >= r[hi] - c) r[lo] += 1;
    else r[hi] -= 1;
  };
  // 1ª redução
  const W = w;
  const H = h;
  if (W === H) {
    cut('x', true);
    cut('y', true);
  } else cut(W > H ? 'x' : 'y', true);
  if (r.x0 !== 0 || r.y0 !== 0 || r.x1 !== w - 1 || r.y1 !== h - 1) stages.push({ ...r });
  // Depois, uma linha por vez
  let flip = false;
  while (r.x1 > r.x0 || r.y1 > r.y0) {
    const rw = r.x1 - r.x0 + 1;
    const rh = r.y1 - r.y0 + 1;
    let axis: 'x' | 'y';
    if (rw === rh) {
      axis = flip ? 'y' : 'x';
      flip = !flip;
    } else axis = rw > rh ? 'x' : 'y';
    cut(axis, false);
    stages.push({ ...r });
  }
  return stages;
}

/** Salas do tabuleiro ligadas entre si (dentro do retângulo)? */
function connected(cells: Set<string>, r: BoardRect, center: string) {
  const inside = [...cells].filter((k) => {
    const [x, y] = k.split(',').map(Number);
    return inRect(r, x, y);
  });
  if (!inside.length) return false;
  const seen = new Set([center]);
  const queue = [center];
  while (queue.length) {
    const [x, y] = queue.shift()!.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = roomKey(x + dx, y + dy);
      if (!seen.has(k) && cells.has(k) && inRect(r, x + dx, y + dy)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return inside.every((k) => seen.has(k));
}

/** Gera o tabuleiro do VS (w x h salas) para `players` gatos. */
export function generateVsFloor(w: number, h: number, players: number, rng: () => number = Math.random): { floor: FloorMap; board: VsBoard } {
  // Centro: a sala do meio; se o lado for par, uma das duas do meio
  const mid = (n: number) => (n % 2 ? (n - 1) / 2 : n / 2 - (rng() < 0.5 ? 1 : 0));
  const cx = mid(w);
  const cy = mid(h);
  const centerKey = roomKey(cx, cy);
  const stages = buildStages(w, h, cx, cy);

  const cells = new Set<string>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.add(roomKey(x, y));

  // Algumas áreas sem sala (~12%), sem nunca separar o mapa em pedaços em nenhuma etapa
  const total = w * h;
  const holes = total > 9 ? Math.floor(total * 0.12) : 0;
  const candidates = [...cells].filter((k) => k !== centerKey).sort(() => rng() - 0.5);
  let made = 0;
  for (const k of candidates) {
    if (made >= holes) break;
    cells.delete(k);
    if (stages.every((r) => connected(cells, r, centerKey))) made++;
    else cells.add(k);
  }

  const rooms: Record<string, RoomDef> = {};
  for (const k of cells) {
    const [gx, gy] = k.split(',').map(Number);
    rooms[k] = { id: k, gx, gy, type: 'normal' };
  }
  const dist = (k: string, x: number, y: number) => {
    const [gx, gy] = k.split(',').map(Number);
    return Math.abs(gx - x) + Math.abs(gy - y);
  };

  // Onde cada gato nasce: numa sala aleatória (sem repetir; longe dos outros quando dá)
  const spawns: string[] = [];
  const pool = [...cells].filter((k) => k !== centerKey || cells.size === 1);
  for (let i = 0; i < players; i++) {
    const free = pool.filter((k) => !spawns.includes(k));
    if (!free.length) break;
    // Tenta manter pelo menos 2 salas de distância dos outros gatos
    for (const minDist of [3, 2, 1, 0]) {
      const ok = free.filter((k) => spawns.every((sp) => dist(k, ...(sp.split(',').map(Number) as [number, number])) >= minDist));
      if (ok.length) {
        const pick = ok[Math.floor(rng() * ok.length)];
        spawns.push(pick);
        rooms[pick].type = 'start';
        break;
      }
    }
  }
  while (spawns.length < players) spawns.push(centerKey);

  // Salas de item (12 num 12x12) e de boss (5), proporcionais ao tamanho; nada em mapas
  // pequenos (9 salas ou menos, como 3x3) ou estreitos (um lado com 2 ou menos, como 2x8)
  const tiny = total <= 9 || Math.min(w, h) <= 2;
  const itemCount = tiny ? 0 : Math.max(1, Math.round((12 * total) / 144));
  const bossCount = tiny ? 0 : Math.max(1, Math.min(5, Math.round((5 * total) / 144)));
  const free = () => Object.values(rooms).filter((r) => r.type === 'normal' && !r.item);
  const spread = (list: RoomDef[], taken: string[]) =>
    list.sort((a, b) => {
      const da = Math.min(99, ...taken.map((t) => dist(t, a.gx, a.gy)));
      const db = Math.min(99, ...taken.map((t) => dist(t, b.gx, b.gy)));
      return db - da + (rng() - 0.5);
    })[0];
  const bossRooms: string[] = [];
  for (let i = 0; i < bossCount; i++) {
    const r = spread(free(), [...spawns, ...bossRooms]);
    if (!r) break;
    r.type = 'boss';
    bossRooms.push(r.id);
  }
  // Boss mais forte mais perto do centro
  bossRooms
    .sort((a, b) => dist(b, cx, cy) - dist(a, cx, cy))
    .forEach((id, i) => (rooms[id].bossLevel = bossCount >= 5 ? i + 1 : Math.min(5, 1 + Math.round((i * 4) / Math.max(1, bossCount - 1)))));
  const itemRooms: string[] = [];
  for (let i = 0; i < itemCount; i++) {
    const r = spread(free(), [...spawns, ...itemRooms]);
    if (!r) break;
    r.item = true;
    itemRooms.push(r.id);
  }
  // Alguns baús de madeira espalhados
  for (const r of free()) if (rng() < 0.08) r.chest = 'wood';

  return {
    floor: { rooms, startId: centerKey },
    board: { w, h, center: [cx, cy], stages, stage: 0, elapsed: 0, itemRooms, bossRooms, spawns },
  };
}
