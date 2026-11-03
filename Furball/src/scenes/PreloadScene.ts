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
    this.load.spritesheet('actives', 'assets/actives.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('vampire', 'assets/vampire.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('pickups', 'assets/pickups.png', { frameWidth: 48, frameHeight: 48 });
    this.load.spritesheet('enemies', 'assets/enemies.png', { frameWidth: 72, frameHeight: 72 });
    for (const b of ['bat', 'rat', 'dog', 'bird', 'human']) this.load.image(`boss_${b}`, `assets/boss_${b}.png`);
    this.load.spritesheet('chest', 'assets/chest.png', { frameWidth: 80, frameHeight: 80 });
    this.load.spritesheet('chest_wood', 'assets/chest_wood.png', { frameWidth: 80, frameHeight: 80 });
    this.load.spritesheet('elements', 'assets/elements.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('campfire', 'assets/campfire.png', { frameWidth: 64, frameHeight: 80 });
    this.load.image('campfire_out', 'assets/campfire_out.png');
    this.load.image('crack', 'assets/crack.png');
    this.load.image('dug', 'assets/dug.png');
    for (const p of ['rock', 'rubble', 'chair', 'chair_broken', 'table', 'table_broken']) {
      this.load.image(p, `assets/${p}.png`);
    }
  }

  create() {
    this.scene.start('Title');
  }
}
