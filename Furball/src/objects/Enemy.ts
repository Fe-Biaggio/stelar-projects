import Phaser from 'phaser';
import { FLOOR } from '../config';

export type EnemyKind = 'fly' | 'spider' | 'blob' | 'pale' | 'boss';

/** Boss de cada nível: 1 morcegão, 2 rato, 3 cachorro, 4 pássaro, 5 humano. */
export type BossType = 'bat' | 'rat' | 'dog' | 'bird' | 'human';
export const BOSS_BY_LEVEL: BossType[] = ['bat', 'rat', 'dog', 'bird', 'human'];

interface BossSpec {
  name: string;
  /** Altura do voo (0 = anda no chão). */
  flying: number;
  /** Velocidade seguindo o gato. */
  follow: number;
  /** Anel de tiros em volta: a cada `every` segundos, `count` tiros. */
  ring?: { every: number; count: number; speed: number };
  /** Leque de tiros mirados no gato. */
  spread?: { every: number; count: number; angle: number; speed: number };
  /** Investidas: a cada `every` segundos, `dashes` investidas seguidas. */
  charge?: { every: number; dashes: number; speed: number };
}

export const BOSSES: Record<BossType, BossSpec> = {
  bat: { name: 'Morcegão', flying: 40, follow: 70, ring: { every: 2.2, count: 8, speed: 200 }, charge: { every: 6, dashes: 1, speed: 520 } },
  rat: { name: 'Ratazana', flying: 0, follow: 130, spread: { every: 1.4, count: 3, angle: 0.3, speed: 260 }, charge: { every: 3.5, dashes: 3, speed: 600 } },
  dog: { name: 'Cachorrão', flying: 0, follow: 90, ring: { every: 2.6, count: 10, speed: 210 }, charge: { every: 4.5, dashes: 2, speed: 650 } },
  bird: { name: 'Gavião', flying: 55, follow: 105, spread: { every: 1.2, count: 5, angle: 0.25, speed: 280 }, charge: { every: 5, dashes: 1, speed: 720 } },
  human: { name: 'O Humano', flying: 0, follow: 55, ring: { every: 2.4, count: 16, speed: 170 }, spread: { every: 1.8, count: 3, angle: 0.22, speed: 300 } },
};

/** O que um inimigo precisa saber do mundo a cada quadro. */
export interface EnemyWorld {
  /** Pés do gato. */
  target: { x: number; y: number };
  /** Cria um tiro inimigo saindo de (x, y) com velocidade (vx, vy). */
  shoot(x: number, y: number, vx: number, vy: number): void;
}

interface EnemySpec {
  hp: number;
  frame: number; // em enemies.png (o boss usa boss.png)
  scale: number;
  /** Raio de acerto (tiros do gato e contato) em volta do centro do corpo. */
  radius: number;
  /** Voa acima do chão (a mosca e o boss): o sprite fica acima da sombra. */
  flying: number;
}

const SPECS: Record<EnemyKind, EnemySpec> = {
  fly: { hp: 3, frame: 0, scale: 0.85, radius: 18, flying: 26 },
  spider: { hp: 4, frame: 1, scale: 0.9, radius: 20, flying: 0 },
  blob: { hp: 6, frame: 2, scale: 1, radius: 22, flying: 0 },
  pale: { hp: 8, frame: 3, scale: 1, radius: 22, flying: 0 },
  boss: { hp: 60, frame: 0, scale: 1, radius: 52, flying: 40 },
};

export const ENEMY_NAMES: Record<EnemyKind, string> = {
  fly: 'Mosca',
  spider: 'Aranha',
  blob: 'Bolota',
  pale: 'Cabeça pálida',
  boss: 'Boss',
};

/** Inimigo genérico; o comportamento muda pelo tipo (`kind`). */
export class Enemy {
  readonly body: Phaser.Physics.Arcade.Body;
  hp: number;
  readonly maxHp: number;
  dead = false;
  private readonly spec: EnemySpec;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  /** Contadores de cada comportamento (segundos). */
  private timer = 0;
  private timer2 = 0;
  private phase = Math.random() * Math.PI * 2;
  /** Fica parado e transparente por um instante ao aparecer, para não pegar o gato de surpresa. */
  private spawnDelay = 0.7;
  private charging = 0;
  private dashesLeft = 0;
  private timer3 = 0;
  private hurtFlash = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    readonly kind: EnemyKind,
    level = 1,
    /** Qual boss (só quando kind === 'boss'). */
    readonly bossType: BossType = 'bat',
  ) {
    this.spec = kind === 'boss' ? { ...SPECS.boss, flying: BOSSES[bossType].flying } : SPECS[kind];
    // Inimigos ficam um pouco mais fortes a cada nível
    this.maxHp = Math.round(this.spec.hp * (1 + (level - 1) * 0.35));
    this.hp = this.maxHp;
    const size = this.spec.radius * 2;
    this.body = scene.physics.add.body(x - size / 2, y - size / 2, size, size);
    this.body.setCollideWorldBounds(true);
    this.body.setBounce(0.6, 0.6);
    this.shadow = scene.add.ellipse(x, y, size * 1.1, size * 0.35, 0x000000, 0.35);
    this.sprite =
      kind === 'boss'
        ? scene.add.image(x, y, `boss_${bossType}`).setOrigin(0.5, 1)
        : scene.add.image(x, y, 'enemies', this.spec.frame).setOrigin(0.5, 1).setScale(this.spec.scale);
    this.sprite.setAlpha(0);
    this.shadow.setAlpha(0);
    scene.tweens.add({ targets: [this.sprite], alpha: 1, duration: 500 });
    scene.tweens.add({ targets: [this.shadow], alpha: 0.35, duration: 500 });
    this.timer = 1 + Math.random();
    this.timer2 = kind === 'boss' ? 4 : 0;
    this.timer3 = 1.5;
    this.sync(0);
  }

  get x() {
    return this.body.center.x;
  }

  /** Posição do "chão" do inimigo (onde fica a sombra). */
  get y() {
    return this.body.bottom - 4;
  }

  /** Nome para a barra de vida (boss) ou para avisos. */
  get name() {
    return this.kind === 'boss' ? BOSSES[this.bossType].name : ENEMY_NAMES[this.kind];
  }

  get radius() {
    return this.spec.radius;
  }

  /** O inimigo está aparecendo ainda (não causa nem leva dano). */
  get spawning() {
    return this.spawnDelay > 0;
  }

  /** Uma bola de pelo no chão em (px, py), com raio r, acerta este inimigo? */
  hits(px: number, py: number, r: number) {
    if (this.dead || this.spawning) return false;
    return Phaser.Math.Distance.Between(px, py, this.x, this.body.center.y) < this.spec.radius + r + 6;
  }

  takeHit(dirX: number, dirY: number, damage: number) {
    if (this.dead || this.spawning) return;
    this.hp -= damage;
    this.hurtFlash = 0.12;
    // Empurrãozinho na direção do tiro (o boss quase não se mexe)
    const push = this.kind === 'boss' ? 30 : 160;
    this.body.velocity.x += dirX * push;
    this.body.velocity.y += dirY * push;
    if (this.hp <= 0) this.die();
  }

  update(dt: number, time: number, world: EnemyWorld) {
    if (this.dead) return;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.spawnDelay > 0) {
      this.spawnDelay -= dt;
      this.body.velocity.set(0, 0);
      this.sync(time);
      return;
    }
    const dx = world.target.x - this.x;
    const dy = world.target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const v = this.body.velocity;
    const steer = (speed: number, k: number) => {
      const f = 1 - Math.exp(-k * dt);
      v.x += ((dx / dist) * speed - v.x) * f;
      v.y += ((dy / dist) * speed - v.y) * f;
    };

    switch (this.kind) {
      case 'fly': {
        // Voa na direção do gato, balançando
        this.phase += dt * 6;
        steer(95, 3);
        v.x += Math.cos(this.phase) * 40 * dt * 6;
        v.y += Math.sin(this.phase * 1.3) * 40 * dt * 6;
        break;
      }
      case 'spider': {
        // Pulos rápidos na direção do gato, com um desvio aleatório
        this.timer -= dt;
        v.scale(Math.exp(-5 * dt));
        if (this.timer <= 0) {
          const a = Math.atan2(dy, dx) + Phaser.Math.FloatBetween(-0.7, 0.7);
          v.set(Math.cos(a) * 300, Math.sin(a) * 300);
          this.timer = Phaser.Math.FloatBetween(0.6, 1.2);
        }
        break;
      }
      case 'blob': {
        // Anda devagar e atira nas 4 direções
        steer(45, 2);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = 2.4;
          for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) world.shoot(this.x, this.y, sx * 230, sy * 230);
          this.squash();
        }
        break;
      }
      case 'pale': {
        steer(115, 2.5);
        break;
      }
      case 'boss':
        this.updateBoss(dt, dx, dy, dist, world);
        break;
    }
    this.sync(time);
  }

  /**
   * Boss: segue o gato e usa os ataques do seu tipo (anel de tiros, leque mirado, investidas).
   * Com menos da metade da vida, ataca mais rápido.
   */
  private updateBoss(dt: number, dx: number, dy: number, dist: number, world: EnemyWorld) {
    const spec = BOSSES[this.bossType];
    const v = this.body.velocity;
    const speedUp = this.hp < this.maxHp / 2 ? 0.7 : 1; // intervalos 30% menores quando bravo
    if (this.charging > 0) {
      this.charging -= dt;
      if (this.charging <= 0) {
        v.scale(0.2);
        // Investidas seguidas (rato, cachorro)
        if (this.dashesLeft > 0) this.startCharge(world, spec.charge!.speed, 0.25);
      }
      return;
    }
    const f = 1 - Math.exp(-1.5 * dt);
    v.x += ((dx / dist) * spec.follow - v.x) * f;
    v.y += ((dy / dist) * spec.follow - v.y) * f;

    if (spec.ring) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = spec.ring.every * speedUp;
        const n = Math.round(spec.ring.count * (speedUp < 1 ? 1.5 : 1));
        const offset = Math.random() * Math.PI;
        for (let i = 0; i < n; i++) {
          const a = offset + (i / n) * Math.PI * 2;
          world.shoot(this.x, this.y, Math.cos(a) * spec.ring.speed, Math.sin(a) * spec.ring.speed);
        }
        this.squash();
        // O humano pisa forte: a tela treme
        if (this.bossType === 'human') this.scene.cameras.main.shake(180, 0.008);
      }
    }
    if (spec.spread) {
      this.timer3 -= dt;
      if (this.timer3 <= 0) {
        this.timer3 = spec.spread.every * speedUp;
        const base = Math.atan2(dy, dx);
        const n = spec.spread.count;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * spec.spread.angle;
          world.shoot(this.x, this.y, Math.cos(a) * spec.spread.speed, Math.sin(a) * spec.spread.speed);
        }
        this.squash();
      }
    }
    if (spec.charge) {
      this.timer2 -= dt;
      if (this.timer2 <= 0) {
        this.timer2 = spec.charge.every * speedUp;
        this.dashesLeft = spec.charge.dashes;
        this.startCharge(world, spec.charge.speed, 0.5);
      }
    }
  }

  /** Avisa (treme em vermelho) e depois se joga na direção do gato. */
  private startCharge(world: EnemyWorld, speed: number, warn: number) {
    this.dashesLeft -= 1;
    this.body.velocity.set(0, 0);
    this.charging = 999; // parado enquanto avisa
    this.sprite.setTint(0xff6060);
    this.scene.tweens.add({
      targets: this.sprite,
      x: '+=5',
      duration: 50,
      yoyo: true,
      repeat: Math.max(1, Math.round(warn / 0.1) - 1),
      onComplete: () => {
        if (this.dead) return;
        this.sprite.clearTint();
        const ndx = world.target.x - this.x;
        const ndy = world.target.y - this.y;
        const nd = Math.hypot(ndx, ndy) || 1;
        this.body.velocity.set((ndx / nd) * speed, (ndy / nd) * speed);
        this.charging = 0.5;
      },
    });
  }

  private squash() {
    const s = this.kind === 'boss' ? 1 : this.spec.scale;
    this.scene.tweens.add({ targets: this.sprite, scaleX: s * 1.2, scaleY: s * 0.85, duration: 90, yoyo: true });
  }

  private sync(time: number) {
    const x = this.x;
    const y = this.y;
    const hover = this.spec.flying ? this.spec.flying + Math.sin(time / 180 + this.phase) * 4 : 0;
    this.shadow.setPosition(x, y).setDepth(y - 1);
    if (!this.scene.tweens.isTweening(this.sprite) || this.kind !== 'boss') this.sprite.x = x;
    this.sprite.y = y - hover;
    this.sprite.setDepth(y + (this.spec.flying ? 2 : 0));
    if (this.hurtFlash > 0) this.sprite.setTintFill(0xffffff);
    else if (this.charging <= 0 && this.sprite.isTinted && !this.scene.tweens.isTweening(this.sprite)) this.sprite.clearTint();
  }

  private die() {
    this.dead = true;
    this.body.enable = false;
    const x = this.x;
    const y = this.sprite.y - 20;
    this.shadow.destroy();
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.clearTint();
    this.scene.tweens.add({
      targets: this.sprite,
      scale: this.sprite.scale * 1.3,
      alpha: 0,
      duration: 220,
      onComplete: () => this.sprite.destroy(),
    });
    // Respingos
    const n = this.kind === 'boss' ? 24 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(20, this.kind === 'boss' ? 120 : 50);
      const p = this.scene.add.circle(x, y, Phaser.Math.FloatBetween(2, 5), i % 2 ? 0x7a1010 : 0x3a0a0a).setDepth(y + 5);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d * 0.6 + 20,
        alpha: 0,
        duration: Phaser.Math.Between(300, 600),
        onComplete: () => p.destroy(),
      });
    }
    this.body.destroy();
  }
}

/** Tiro dos inimigos: bolinha vermelha que voa reto até bater na parede. */
export class EnemyShot {
  dead = false;
  private readonly sprite: Phaser.GameObjects.Arc;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private life = 3;

  constructor(
    private readonly scene: Phaser.Scene,
    public x: number,
    public y: number,
    private readonly vx: number,
    private readonly vy: number,
  ) {
    this.shadow = scene.add.ellipse(x, y, 12, 5, 0x000000, 0.3);
    this.sprite = scene.add.circle(x, y - 22, 7, 0xd8302a).setStrokeStyle(2, 0x3a0a08);
  }

  update(dt: number) {
    if (this.dead) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.shadow.setPosition(this.x, this.y).setDepth(this.y - 1);
    this.sprite.setPosition(this.x, this.y - 22).setDepth(this.y);
    const out =
      this.x < FLOOR.x || this.x > FLOOR.x + FLOOR.width || this.y < FLOOR.y || this.y > FLOOR.y + FLOOR.height;
    if (out || this.life <= 0) this.burst();
  }

  burst() {
    if (this.dead) return;
    this.dead = true;
    const { x, y } = this.sprite;
    this.sprite.destroy();
    this.shadow.destroy();
    const pop = this.scene.add.circle(x, y, 7, 0xd8302a, 0.8).setDepth(this.y);
    this.scene.tweens.add({ targets: pop, scale: 2, alpha: 0, duration: 160, onComplete: () => pop.destroy() });
  }
}
