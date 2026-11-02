// Medidas da sala, no estilo de uma sala de Isaac: 13 x 7 tiles de chão cercados por paredes.
export const TILE = 64;
export const ROOM_COLS = 13;
export const ROOM_ROWS = 7;
export const WALL = 64;

export const GAME_WIDTH = ROOM_COLS * TILE + WALL * 2; // 960
export const GAME_HEIGHT = ROOM_ROWS * TILE + WALL * 2; // 576

// Área onde os pés do jogador podem andar.
export const FLOOR = {
  x: WALL,
  y: WALL,
  width: ROOM_COLS * TILE,
  height: ROOM_ROWS * TILE,
};
