import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { RoomScene } from './scenes/RoomScene';

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
  scene: [RoomScene],
});

// Em desenvolvimento, deixa o jogo acessível pelo console do navegador (window.furball).
if (import.meta.env.DEV) (window as unknown as { furball: Phaser.Game }).furball = game;
