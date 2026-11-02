import Phaser from 'phaser';
import { CatId } from '../cats';
import { FLOOR } from '../config';

const SHOT_SPEED = 430; // pixels por segundo
const RANGE = 220; // distância percorrida antes de começar a cair (~5 tiles no total, com a queda)
const FALL_GRAVITY = 900; // aceleração da queda no fim do alcance
const INHERIT = 0.35; // quanto da velocidade do gato passa para o tiro
const RADIUS = 10; // raio na textura
const SCALE = 0.7; // tamanho final na tela (30% menor que a textura)
export const FURBALL_HIT_RADIUS = RADIUS * SCALE;

/** Cores da bola de pelo de cada gato: contorno, base, fios internos e brilho. */
interface FurPalette {
  outline: number;
  base: number;
  strands: number[];
  shine: number;
}

const PALETTES: Record<CatId, FurPalette> = {
  black: { outline: 0x141111, base: 0x2a2524, strands: [0x3d3533, 0x1a1615], shine: 0x5a504c },
  orange: { outline: 0x4a2410, base: 0xd27a2c, strands: [0xf0a552, 0x9a5019], shine: 0xffd29a },
  siamese: { outline: 0x3a2418, base: 0xe3d6bd, strands: [0xfff3de, 0x6b4a36], shine: 0xffffff },
  calico: { outline: 0x241612, base: 0xefe7dc, strands: [0xd27a2c, 0x2a2524, 0xd27a2c], shine: 0xffffff },
  tuxedo: { outline: 0x141111, base: 0x2a2524, strands: [0xe8e4de, 0x1a1615], shine: 0x8a8480 },
  gray: { outline: 0x2a2a2c, base: 0x77777b, strands: [0x9a9a9e, 0x4f4f53], shine: 0xd0d0d4 },
};

/** Gera a textura da bola de pelo do gato (uma vez por jogo). */
export function createFurballTexture(scene: Phaser.Scene, cat: CatId) {
  const key = `furball_${cat}`;
  if (scene.textures.exists(key)) return;
  const pal = PALETTES[cat];
  const size = 32;
  const c = size / 2;
  const rng = new Phaser.Math.RandomDataGenerator(['pelo']);
  const g = scene.make.graphics({}, false);

  // Fios soltos para fora da bola
  for (let i = 0; i < 26; i++) {
    const a = rng.realInRange(0, Math.PI * 2);
    const r0 = RADIUS - 3;
    const r1 = RADIUS + rng.realInRange(1, 4);
    g.lineStyle(2, i % 3 ? pal.outline : pal.base, 1);
    g.lineBetween(c + Math.cos(a) * r0, c + Math.sin(a) * r0, c + Math.cos(a + 0.25) * r1, c + Math.sin(a + 0.25) * r1);
  }
  g.fillStyle(pal.outline).fillCircle(c, c, RADIUS + 1);
  g.fillStyle(pal.base).fillCircle(c, c, RADIUS - 1);
  // Fios enrolados por dentro
  for (let i = 0; i < 14; i++) {
    const a = rng.realInRange(0, Math.PI * 2);
    const r = rng.realInRange(1, RADIUS - 3);
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    g.lineStyle(1.5, pal.strands[i % pal.strands.length], 1);
    g.beginPath();
    g.arc(x, y, rng.realInRange(2, 4), a, a + rng.realInRange(1.5, 3));
    g.strokePath();
  }
  g.fillStyle(pal.shine, 0.7).fillCircle(c - 3, c - 4, 2.5); // brilho
  g.generateTexture(key, size, size);
  g.destroy();
}

/**
 * Bola de pelo cuspida pelo gato. Anda no chão (x, y) com uma altura de voo;
 * a sombra fica no chão e o sprite fica acima dela, como as lágrimas do Isaac.
 */
export class Furball {
  dead = false;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly vx: number;
  private readonly vy: number;
  private traveled = 0;
  private height: number;
  private fallSpeed = 0;
  private readonly palette: FurPalette;

  constructor(
    private readonly scene: Phaser.Scene,
    cat: CatId,
    private x: number,
    private y: number,
    dir: Phaser.Math.Vector2,
    startHeight: number,
    inherited: Phaser.Math.Vector2,
  ) {
    this.vx = dir.x * SHOT_SPEED + inherited.x * INHERIT;
    this.vy = dir.y * SHOT_SPEED + inherited.y * INHERIT;
    this.height = startHeight;
    this.palette = PALETTES[cat];
    this.shadow = scene.add.ellipse(x, y, 13, 5, 0x000000, 0.3);
    this.sprite = scene.add.image(x, y - startHeight, `furball_${cat}`).setScale(SCALE * 0.25);
    // Sai de dentro da boca crescendo rapidinho
    scene.tweens.add({ targets: this.sprite, scale: SCALE, duration: 110, ease: 'Back.Out' });
    this.sync();
  }

  update(dt: number) {
    if (this.dead) return;
    const dx = this.vx * dt;
    const dy = this.vy * dt;
    this.x += dx;
    this.y += dy;
    this.traveled += Math.hypot(dx, dy);

    // Ao chegar no alcance, começa a cair até tocar o chão.
    if (this.traveled > RANGE) {
      this.fallSpeed += FALL_GRAVITY * dt;
      this.height -= this.fallSpeed * dt;
    }
    this.sprite.rotation += dt * 9 * Math.sign(this.vx || this.vy);
    this.sync();

    const hitWall =
      this.x < FLOOR.x + 4 ||
      this.x > FLOOR.x + FLOOR.width - 4 ||
      this.y < FLOOR.y + 2 ||
      this.y > FLOOR.y + FLOOR.height - 2;
    if (this.height <= 0 || hitWall) this.burst();
  }

  /** Posição no chão, usada nas colisões com inimigos. */
  get position() {
    return { x: this.x, y: this.y };
  }

  /** Direção do voo (vetor unitário). */
  get direction() {
    const len = Math.hypot(this.vx, this.vy) || 1;
    return { x: this.vx / len, y: this.vy / len };
  }

  burst() {
    if (this.dead) return;
    this.dead = true;
    const px = this.sprite.x;
    const py = this.sprite.y;
    this.sprite.destroy();
    this.shadow.destroy();

    // Tufos de pelo se espalhando
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.6;
      const dist = Phaser.Math.Between(7, 16);
      const tuft = this.scene.add
        .circle(px, py, Phaser.Math.FloatBetween(1.5, 3), i % 2 ? this.palette.base : this.palette.outline)
        .setDepth(this.y + 1);
      this.scene.tweens.add({
        targets: tuft,
        x: px + Math.cos(a) * dist,
        y: py + Math.sin(a) * dist + 6,
        alpha: 0,
        scale: 0.4,
        duration: Phaser.Math.Between(220, 340),
        ease: 'Quad.Out',
        onComplete: () => tuft.destroy(),
      });
    }
  }

  private sync() {
    this.shadow.setPosition(this.x, this.y);
    this.shadow.setDepth(this.y - 1);
    this.sprite.setPosition(this.x, this.y - Math.max(this.height, 0));
    this.sprite.setDepth(this.y);
  }
}
