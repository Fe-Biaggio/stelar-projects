import { CatId } from '../cats';

// Configuração e jogadores da sala de espera (ficam guardados entre uma partida e outra).

export interface LobbyConfig {
  isPublic: boolean;
  mode: 'coop' | 'vs';
  /** Co-op: itens valem para os dois. */
  sharedItems: boolean;
  /** VS: tamanho do tabuleiro. */
  w: number;
  h: number;
}

export interface LobbyPlayer {
  /** Conexão do jogador ("host" para quem hospeda). */
  id: string;
  name: string;
  cat: CatId | null;
  ping: number;
}

/** O que todos veem na sala de espera (quem hospeda manda para os outros). */
export interface LobbyView {
  code: string;
  isPublic: boolean;
  config: LobbyConfig;
  players: LobbyPlayer[];
}

export const lobbyConfig: LobbyConfig = { isPublic: true, mode: 'coop', sharedItems: true, w: 12, h: 12 };

/** Jogadores na sala (só em quem hospeda). */
export const lobbyPlayers: LobbyPlayer[] = [];

export function maxPlayers(mode: LobbyConfig['mode']) {
  return mode === 'coop' ? 2 : 4;
}
