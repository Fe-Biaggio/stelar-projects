import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { PreloadScene } from './scenes/PreloadScene';
import { RoomScene } from './scenes/RoomScene';
import { SelectScene } from './scenes/SelectScene';
import { TitleScene } from './scenes/TitleScene';
import { BrowseScene, CreateScene, MultiScene } from './scenes/MultiScenes';
import { LobbyScene } from './scenes/LobbyScene';
import { MirrorScene } from './scenes/MirrorScene';
import { registerRoomScene, vs } from './scenes/vsDirector';
import { net, privateId } from './net/peer';
import { session } from './net/session';
import { lobbyConfig } from './scenes/lobbyState';
import { joinRoom } from './scenes/MultiScenes';
import { installAudioUnlock } from './audio/sfx';

// Abra com ?debug na URL para ver as caixas de colisão.
const debug = new URLSearchParams(window.location.search).has('debug');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0d0b0a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug },
  },
  scene: [PreloadScene, TitleScene, SelectScene, RoomScene, MultiScene, CreateScene, BrowseScene, LobbyScene, MirrorScene],
});

// Modo VS: cada sala ocupada é uma cena própria
registerRoomScene((key) => new RoomScene(key));
installAudioUnlock(game);

// Em desenvolvimento, deixa o jogo acessível pelo console do navegador (window.furball).
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.furball = game;
  const sims: unknown[] = [];
  w.furballDev = {
    net,
    session,
    vs,
    lobbyConfig,
    joinRoom,
    privateId,
    sims,
    // Simula partidas VS só com bots: furballDev.simVs(4, 12, 12) ou simMany([[4,12,12], ...])
    simVs: async (n: number, w2: number, h: number, speed?: number) => (await import('./dev/simVs')).simVs(game, n, w2, h, speed),
    simMany: async (list: [number, number, number][], speed?: number) => {
      const { simVs } = await import('./dev/simVs');
      for (const [n, w2, h] of list) sims.push(await simVs(game, n, w2, h, speed));
      return sims;
    },
  };
}
