import Phaser from 'phaser';
import { CAT_FRAME_W, CATS, CatId } from '../cats';
import { ITEMS, ItemInfo, applyItem } from '../items';
import { HP_PER_HEART, Stats } from '../stats';

export type Facing = 'down' | 'up' | 'left' | 'right';

// Índice de cada direção em public/assets/cat_black.png.
const FRAME: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };
// Boca aberta (de costas não aparece a boca, então repete o frame de costas).
const FRAME_SHOOT: Record<Facing, number> = { down: 4, up: 1, left: 5, right: 6 };

export const DIR_VECTOR: Record<Facing, Phaser.Math.Vector2> = {
  down: new Phaser.Math.Vector2(0, 1),
  up: new Phaser.Math.Vector2(0, -1),
  left: new Phaser.Math.Vector2(-1, 0),
  right: new Phaser.Math.Vector2(1, 0),
};

const SPEED = 270; // pixels por segundo (com velocidade 1x)
const ACCEL = 14; // quão rápido atinge a velocidade (maior = mais "seco")
const DECEL = 10; // quão rápido para ao soltar as teclas
const SPRITE_SCALE = 0.8;
const ORIGIN_Y = 0.97;
// Altura da nuca no frame (de costas a bola sai de trás da cabeça).
const HEAD_BACK_Y = 50;

const FIRE_DELAY = 0.4; // segundos entre tiros (com cadência 1x)
const MOUTH_OPEN_TIME = 0.16; // quanto tempo a boca fica aberta após atirar

const INVULNERABLE_TIME = 1.0; // segundos piscando após levar dano
const KNOCKBACK = 380;

// A colisão fica só nos pés, assim a cabeça pode passar na frente da parede de cima.
const FEET_W = 40;
const FEET_H = 22;

export interface ShotRequest {
  x: number;
  y: number;
  height: number;
  dir: Phaser.Math.Vector2;
  inherited: Phaser.Math.Vector2;
  stats: Stats;
}

/**
 * O gato jogador. Eventos emitidos:
 *  - 'hp' (hp, maxHp, shield) quando a vida ou o escudo mudam (em pontos; maxHp em corações)
 *  - 'stats' (stats: Stats) quando um item muda os status
 *  - 'dead' quando a vida chega a zero
 */
export class Player extends Phaser.Events.EventEmitter {
  readonly body: Phaser.Physics.Arcade.Body;
  /** Vida vermelha, em pontos (2 por coração). */
  hp: number;
  /** Escudo azul, em pontos. É perdido antes da vida e não se recupera. */
  shield: number;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private facing: Facing = 'down';
  private walkTime = 0;
  private fireCooldown = 0;
  private mouthTimer = 0;
  private invulnerable = 0;
  /** Item usável carregado e quanto recarregou (1 = pronto). */
  active?: ItemInfo;
  activeCharge = 1;
  /** Tempo restante dos efeitos dos itens usáveis (segundos). */
  invincibleTime = 0;
  damageBoostTime = 0;
  /** Altura em que o gato está (subido na cadeira ou na mesa), em pixels. */
  private liftTarget = 0;
  private lift = 0;
  /** Profundidade mínima de desenho (para aparecer na frente do móvel em que subiu). */
  private minDepth = 0;
  /** Boca em relação aos pés, já na escala do sprite: [x, altura]. */
  private readonly mouth: Record<Facing, [number, number]>;

  /** `stats` é compartilhado com a partida, para os itens valerem em todas as salas. */
  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    readonly cat: CatId,
    readonly stats: Stats,
    hp: number,
    shield: number,
    facing: Facing = 'down',
  ) {
    super();
    this.hp = hp;
    this.shield = shield;
    this.facing = facing;
    const feetY = 96 * ORIGIN_Y;
    const toFeet = ([mx, my]: [number, number]): [number, number] => [
      (mx - CAT_FRAME_W / 2) * SPRITE_SCALE,
      (feetY - my) * SPRITE_SCALE,
    ];
    const m = CATS[cat].mouth;
    this.mouth = {
      down: toFeet(m.down),
      left: toFeet(m.left),
      right: toFeet(m.right),
      up: toFeet([CAT_FRAME_W / 2, HEAD_BACK_Y]),
    };

    this.body = scene.physics.add.body(x - FEET_W / 2, y - FEET_H / 2, FEET_W, FEET_H);
    this.body.setCollideWorldBounds(true);

    this.shadow = scene.add.ellipse(x, y, 54, 16, 0x000000, 0.35);
    this.sprite = scene.add
      .sprite(x, y, `cat_${cat}`, FRAME[facing])
      .setOrigin(0.5, ORIGIN_Y)
      .setScale(SPRITE_SCALE);
  }

  get dead() {
    return this.hp + this.shield <= 0;
  }

  /** Para onde o gato está olhando (o botão A atira para lá). */
  get facingDir(): Facing {
    return this.facing;
  }

  /** Morre na hora (sala destruída no VS, jogador que saiu da partida). */
  kill() {
    if (this.dead) return;
    this.hp = 0;
    this.shield = 0;
    this.emitHp();
    this.die();
  }

  /** Tira o gato da cena (trocou de sala no VS). */
  destroy() {
    this.removeAllListeners();
    this.body.destroy();
    this.sprite.destroy();
    this.shadow.destroy();
  }

  /** Sobe (ou desce) do móvel: `height` em pixels; `minDepth` para desenhar na frente dele. */
  setElevation(height: number, minDepth: number) {
    this.liftTarget = height;
    this.minDepth = minDepth;
  }

  /** Altura atual do gato acima do chão (para o tiro sair da boca na altura certa). */
  get elevation() {
    return this.lift;
  }

  get feet() {
    return { x: this.body.center.x, y: this.body.bottom - 2 };
  }

  /**
   * `move`: direção pedida (componentes entre -1 e 1).
   * `aim`: direção do tiro enquanto a tecla está pressionada, ou null.
   * Retorna um pedido de tiro quando o gato cospe uma bola de pelo.
   */
  update(move: Phaser.Math.Vector2, aim: Facing | null, dt: number, time: number): ShotRequest | null {
    if (this.dead) return null;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.updateActive(dt, time);
    this.mouthTimer = Math.max(0, this.mouthTimer - dt);
    this.updateInvulnerability(dt);

    const moving = move.lengthSq() > 0;
    if (move.lengthSq() > 1) move.normalize(); // analógico pela metade anda mais devagar

    // Aceleração suave, igual em qualquer taxa de quadros.
    const k = 1 - Math.exp(-(moving ? ACCEL : DECEL) * dt);
    const v = this.body.velocity;
    const speed = SPEED * this.stats.speed;
    v.x += (move.x * speed - v.x) * k;
    v.y += (move.y * speed - v.y) * k;
    if (!moving && v.lengthSq() < 4) v.reset();

    // Atirando, o gato olha para onde atira; senão, para onde anda.
    if (aim) this.facing = aim;
    else if (moving) this.updateFacing(move);

    let shot: ShotRequest | null = null;
    if (aim && this.fireCooldown === 0) {
      this.fireCooldown = FIRE_DELAY / this.stats.fireRate;
      this.mouthTimer = MOUTH_OPEN_TIME;
      // A bola nasce no centro da boca. No chão, fica 1px à frente (ou atrás, de costas)
      // dos pés, para ser desenhada na frente do gato ou escondida atrás da cabeça.
      const [mx, mh] = this.mouth[aim];
      const dir = DIR_VECTOR[aim];
      const groundOffset = aim === 'up' ? -1 : 1;
      shot = {
        x: this.feet.x + mx,
        y: this.feet.y + groundOffset,
        height: mh + groundOffset + this.lift,
        dir: dir.clone(),
        inherited: v.clone(),
        // Com a patinha ativa, o dano dobra só nos tiros feitos durante o efeito
        stats: this.damageBoostTime > 0 ? { ...this.stats, damage: this.stats.damage * 2 } : this.stats,
      };
      // Pequeno "solavanco" ao cuspir
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: SPRITE_SCALE * 1.08,
        scaleY: SPRITE_SCALE * 0.92,
        duration: 60,
        yoyo: true,
      });
    }

    this.sprite.setFrame(this.mouthTimer > 0 ? FRAME_SHOOT[this.facing] : FRAME[this.facing]);
    this.animate(dt, time);
    return shot;
  }

  /** Tira vida e empurra o gato para longe de (fromX, fromY). */
  takeDamage(amount: number, fromX: number, fromY: number) {
    if (this.dead || this.invulnerable > 0 || this.invincibleTime > 0) return;
    // O escudo azul absorve o dano primeiro
    const fromShield = Math.min(this.shield, amount);
    this.shield -= fromShield;
    // Arredonda para evitar sobras como 0,0000001 com dano fracionado
    this.shield = Math.round(this.shield * 100) / 100;
    this.hp = Math.max(0, Math.round((this.hp - (amount - fromShield)) * 100) / 100);
    this.emitHp();
    this.emit('hurt');

    const push = new Phaser.Math.Vector2(this.feet.x - fromX, this.feet.y - fromY);
    if (push.lengthSq() === 0) push.set(0, 1);
    // O empurrão vale também em cima da mesa: um inimigo que voa pode derrubar o gato dela
    push.normalize().scale(KNOCKBACK);
    this.body.velocity.set(push.x, push.y);

    this.sprite.setTintFill(0xff4040);
    this.scene.time.delayedCall(90, () => this.sprite.clearTint());
    this.scene.cameras.main.shake(140, 0.006);

    if (this.dead) {
      this.die();
    } else {
      this.invulnerable = INVULNERABLE_TIME;
    }
  }

  get maxPoints() {
    return this.stats.maxHp * HP_PER_HEART;
  }

  /** Recupera vida vermelha (sem passar do máximo). Retorna quanto curou. */
  heal(points: number) {
    const healed = Math.min(points, this.maxPoints - this.hp);
    if (healed <= 0) return 0;
    this.hp += healed;
    this.emitHp();
    return healed;
  }

  /** Doa vida ao gatinho vampiro: perde pontos sem empurrão nem invulnerabilidade. */
  donateBlood(points: number) {
    this.hp = Math.max(1, this.hp - points);
    this.emitHp();
    this.sprite.setTintFill(0xc83040);
    this.scene.time.delayedCall(90, () => this.sprite.clearTint());
  }

  /** Ganha escudo azul. */
  addShield(points: number) {
    this.shield += points;
    this.emitHp();
  }

  private emitHp() {
    this.emit('hp', this.hp, this.stats.maxHp, this.shield);
  }

  /** Pega um item: aplica nos status e faz o gato comemorar. */
  collect(item: ItemInfo): ItemInfo | undefined {
    if (item.active) {
      // Item usável: fica no slot (troca com o que tinha, que é devolvido para ir ao chão)
      const old = this.active;
      this.active = item;
      this.activeCharge = 1;
      this.emit('active');
      this.scene.tweens.add({ targets: this.sprite, scaleY: SPRITE_SCALE * 1.15, duration: 110, yoyo: true });
      return old;
    }
    applyItem(this.stats, item);
    if (item.stat === 'maxHp') {
      this.hp += HP_PER_HEART; // a lata também enche o coração novo
      this.emitHp();
    }
    this.emit('stats', this.stats);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: SPRITE_SCALE * 0.9,
      scaleY: SPRITE_SCALE * 1.15,
      duration: 110,
      yoyo: true,
      ease: 'Quad.Out',
    });
  }

  private die() {
    this.body.velocity.reset();
    this.body.enable = false;
    this.sprite.setFrame(FRAME.down).setAlpha(1);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 90,
      y: this.sprite.y + 4,
      scaleY: SPRITE_SCALE * 0.9,
      duration: 380,
      ease: 'Bounce.Out',
    });
    this.scene.tweens.add({ targets: this.shadow, scaleX: 1.4, duration: 380 });
    this.emit('dead');
  }

  /** Carrega um item usável salvo na partida (ao trocar de sala). */
  loadActive(saved?: { id: string; charge: number }) {
    if (!saved) return;
    this.active = ITEMS[saved.id as keyof typeof ITEMS];
    this.activeCharge = saved.charge;
  }

  /** Usa o item usável, se estiver carregado. */
  useActive() {
    if (this.dead || !this.active?.active || this.activeCharge < 1) return false;
    const { effect, duration } = this.active.active;
    if (effect === 'invincible') this.invincibleTime = duration;
    else this.damageBoostTime = duration;
    this.activeCharge = 0;
    this.emit('active');
    this.scene.tweens.add({ targets: this.sprite, scaleX: SPRITE_SCALE * 1.25, scaleY: SPRITE_SCALE * 1.25, duration: 120, yoyo: true });
    return true;
  }

  /** Recarga do item usável e brilho dos efeitos ativos. */
  private updateActive(dt: number, time: number) {
    if (this.active?.active && this.activeCharge < 1) {
      const before = this.activeCharge;
      this.activeCharge = Math.min(1, this.activeCharge + dt / this.active.active.recharge);
      if (before < 1 && this.activeCharge >= 1) this.emit('active');
    }
    this.invincibleTime = Math.max(0, this.invincibleTime - dt);
    this.damageBoostTime = Math.max(0, this.damageBoostTime - dt);
    if (this.invulnerable > 0) return; // o pisca-pisca do dano tem prioridade
    const pulse = (Math.sin(time / 90) + 1) / 2;
    if (this.invincibleTime > 0) this.sprite.setTint(Phaser.Display.Color.GetColor(255, 220 + pulse * 35, 120 + pulse * 100));
    else if (this.damageBoostTime > 0) this.sprite.setTint(Phaser.Display.Color.GetColor(255, 120 + pulse * 80, 120 + pulse * 80));
    else if (this.sprite.isTinted) this.sprite.clearTint();
  }

  private updateInvulnerability(dt: number) {
    if (this.invulnerable <= 0) return;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    // Pisca enquanto está invulnerável
    this.sprite.setAlpha(this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 === 0 ? 0.3 : 1);
  }

  private animate(dt: number, time: number) {
    // Posiciona sprite e sombra sobre os pés.
    const { x: feetX, y: groundY } = this.feet;
    // Sobe/desce do móvel suavemente
    this.lift += (this.liftTarget - this.lift) * (1 - Math.exp(-18 * dt));
    const feetY = groundY - this.lift;
    const depth = Math.max(groundY, this.minDepth);
    this.shadow.setPosition(feetX, feetY - 4);
    this.sprite.setDepth(depth);
    this.shadow.setDepth(depth - 1);

    // Só há um quadro por direção, então o andar é animado com pulinhos e balanço.
    const speedRatio = Math.min(this.body.velocity.length() / (SPEED * this.stats.speed), 1);
    const tweening = this.scene.tweens.isTweening(this.sprite);
    if (speedRatio > 0.1) {
      this.walkTime += dt * 11 * speedRatio;
      const hop = Math.abs(Math.sin(this.walkTime));
      this.sprite.setPosition(feetX, feetY - hop * 6 * speedRatio);
      this.sprite.setAngle(Math.sin(this.walkTime) * 5 * speedRatio);
      if (!tweening) {
        this.sprite.setScale(SPRITE_SCALE * (1 + (1 - hop) * 0.04), SPRITE_SCALE * (1 - (1 - hop) * 0.05));
      }
      this.shadow.setScale(1 - hop * 0.15);
    } else {
      this.walkTime = 0;
      this.sprite.setPosition(feetX, feetY);
      this.sprite.setAngle(0);
      if (!tweening) {
        const breathe = Math.sin(time / 350) * 0.015;
        this.sprite.setScale(SPRITE_SCALE * (1 - breathe * 0.5), SPRITE_SCALE * (1 + breathe));
      }
      this.shadow.setScale(1);
    }
  }

  private updateFacing(dir: Phaser.Math.Vector2) {
    const ax = Math.abs(dir.x);
    const ay = Math.abs(dir.y);
    const horizontal: Facing = dir.x < 0 ? 'left' : 'right';
    const vertical: Facing = dir.y < 0 ? 'up' : 'down';

    if (ax > ay + 0.01) this.facing = horizontal;
    else if (ay > ax + 0.01) this.facing = vertical;
    // Na diagonal, mantém a direção atual se ela fizer parte do movimento.
    else if (this.facing !== horizontal && this.facing !== vertical) this.facing = horizontal;
  }
}
