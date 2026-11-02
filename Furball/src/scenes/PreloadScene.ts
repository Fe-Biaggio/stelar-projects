import Phaser from 'phaser';
import { loadCatSheets } from '../cats';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/** Carrega todos os sprites uma vez e abre a seleção de personagem. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Carregando...', { fontFamily: 'monospace', fontSize: '20px', color: '#e8d9c4' })
      .setOrigin(0.5);
    loadCatSheets(this);
    this.load.spritesheet('hearts', 'assets/hearts.png', { frameWidth: 32, frameHeight: 30 });
    this.load.spritesheet('items', 'assets/items.png', { frameWidth: 64, frameHeight: 64 });
  }

  create() {
    this.scene.start('Select');
  }
}
