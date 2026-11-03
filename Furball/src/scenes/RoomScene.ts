import Phaser from 'phaser';
import { FLOOR, GAME_HEIGHT, GAME_WIDTH, ROOM_COLS, ROOM_ROWS, TILE, WALL } from '../config';
import { CatId, PLAYABLE } from '../cats';
import { ITEMS, ItemId, randomItemOf } from '../items';
import { Bomb } from '../objects/Bomb';
import { Chest } from '../objects/Chest';
import { BOSS_BY_LEVEL, Enemy, EnemyKind, EnemyShot } from '../objects/Enemy';
import { DummyCat } from '../objects/DummyCat';
import { Furball, createFurballTexture } from '../objects/Furball';
import { ItemPickup, ItemSpawn } from '../objects/ItemPickup';
import { Pickup } from '../objects/Pickup';
import { Vendor } from '../objects/Vendor';
import { Npc } from '../objects/Npc';
import { Facing, Player } from '../objects/Player';
import { HEART_POINTS, PICKUP_FRAME, PickupKind, addPickup, isHeart, useKey } from '../pickups';
import { RARITY_INFO, RARITY_ORDER, rarityOdds, rollRarity } from '../rarity';
import { GameMode, MAX_LEVEL, RoomId, RoomState, Run, newRun, startNextLevel } from '../run';
import { STAT_LABELS, Stats, formatMult } from '../stats';
import { BTN, PadInput } from '../ui/Gamepad';
import { TouchControls, isTouchDevice } from '../ui/TouchControls';
import { drawScorch, playExplosion } from '../world/explosion';
import { priceOf, rollShopItems } from '../shop';
import { RoomDef, doorKey, neighbors } from '../world/floor';
import { DOOR_POS, DoorSide, drawBossDoorMark, drawDoorBars, drawDoorCracks, drawLockedDoor, drawRoom, drawTrapdoor } from '../world/room';
import {
  Prop,
  blocksWalk,
  breakable,
  devPropsLayout,
  generateProps,
  occupancy,
  propRect,
  tileAt,
  tileCenter,
} from '../world/props';

type MoveKeys = Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
type AimKeys = Record<Facing, Phaser.Input.Keyboard.Key>;

// Espinhos no chão da sala inicial, para testar a vida (coluna, linha em tiles do chão).
const SPIKES: [number, number][] = [
  [2, 1],
  [10, 5],
];

// Itens de teste espalhados pela sala inicial (id, coluna, linha em tiles do chão).
const TEST_ITEMS: [ItemId, number, number][] = [
  ['can', 4, 1],
  ['catnip', 6, 1],
  ['brush', 8, 1],
  ['churu', 10, 1],
  ['yarn', 2, 5],
  ['fish', 4, 5],
  ['milk', 8, 5],
];

// Moedas, bombas e chaves de teste na sala inicial (tipo, coluna, linha em tiles do chão).
const TEST_PICKUPS: [PickupKind, number, number][] = [
  ['coin', 1, 2],
  ['coin', 1, 4],
  ['bomb', 11, 2],
  ['key', 11, 4],
  ['goldenKey', 0, 6],
  ['heart', 11, 6],
  ['halfHeart', 12, 6],
  ['blueHeart', 12, 5],
];

// Sala de testes dos itens usáveis (modo desenvolvedor).
const DEV_ACTIVE_ITEMS: [ItemId, number, number][] = [
  ['collar', 4, 4],
  ['paw', 8, 4],
];
// Gatinhos: chance de dar um item a cada moeda / a cada ponto de vida doado.
const BEGGAR_ITEM_CHANCE = 0.2;
const VAMPIRE_ITEM_CHANCE = 0.3;
/** Depois de dar este número de itens, o gatinho vai embora. */
const NPC_MAX_ITEMS = 2;
/** Doar este total (3 corações) e ficar com meio coração dá a capa de vampiro. */
const VAMPIRE_REWARD_BLOOD = 6;

// Bombas para testar na sala de obstáculos (modo desenvolvedor).
const DEV_PROPS_BOMBS: [number, number][] = [
  [11, 5],
  [12, 5],
  [11, 6],
];

// Bomba: até onde causa dano e até onde empurra as coisas.
const BLAST_RADIUS = 110;
const KNOCK_RADIUS = 220;
const KNOCK_MAX = 260; // distância que algo colado na bomba é lançado
const BOMB_DAMAGE_PLAYER = 2; // 1 coração
const BOMB_DAMAGE_ENEMY = 10;
/** Dano de qualquer inimigo no nível 1 (contato ou tiro): 1 = meio coração. */
const ENEMY_DAMAGE = 1;
/** Quanto o dano dos inimigos cresce a cada nível (0,5x). */
const ENEMY_DAMAGE_PER_LEVEL = 0.5;

// Corações no HUD: quantos por linha e o espaçamento.
const HEARTS_PER_ROW = 8;
const HEART_GAP = 34;
const HEART_ROW_H = 30;

// Recompensa ao limpar uma sala comum (peso de cada coletável; "none" = nada).
const CLEAR_DROPS: [PickupKind | 'none', number][] = [
  ['coin', 34],
  ['heart', 12],
  ['halfHeart', 10],
  ['key', 22],
  ['bomb', 12],
  ['blueHeart', 4],
  ['goldenKey', 2],
  ['none', 14],
];

// O que um inimigo solta ao morrer (um sorteio por inimigo; "item" = item sorteado pela sorte).
const ENEMY_DROPS: [PickupKind | 'item' | 'none', number][] = [
  ['coin', 50],
  ['key', 10],
  ['bomb', 5],
  ['item', 5],
  ['none', 35],
];

// O que o baú de madeira (sem chave) solta: 2 ou 3 coletáveis e, às vezes, um item.
const WOOD_CHEST_DROPS: [PickupKind, number][] = [
  ['coin', 45],
  ['heart', 20],
  ['bomb', 15],
  ['key', 25],
  ['blueHeart', 5],
];
const WOOD_CHEST_ITEM_CHANCE = 0.1;

// Altura do gato em cima da cadeira e da mesa (pixels).
const CHAIR_LIFT = 16;
const TABLE_LIFT = 30;

/** Elemento da sala já montado na cena. */
interface PropObj {
  prop: Prop;
  body?: Phaser.Physics.Arcade.StaticBody;
  sprite?: Phaser.GameObjects.Image;
}

// Tipos de inimigo das salas comuns (peso de cada um).
const ENEMY_POOL: [EnemyKind, number][] = [
  ['fly', 3],
  ['spider', 3],
  ['blob', 2],
  ['pale', 2],
];

// Itens da loja: posição na frente da bancada.
const SHOP_ITEM_Y = 330;
const SHOP_ITEM_GAP = 150;

const OPPOSITE: Record<DoorSide, DoorSide> = { left: 'right', right: 'left', up: 'down', down: 'up' };

// Onde o item cai ao sair do baú (em relação ao baú). Se o lugar estiver ocupado, usa o próximo.
const DROP_SPOTS: [number, number][] = [
  [0, 70],
  [-80, 50],
  [80, 50],
  [-90, -10],
  [90, -10],
  [0, 130],
];

interface RoomData {
  cat?: CatId;
  mode?: GameMode;
  run?: Run;
  room?: RoomId;
  /** Porta por onde o gato entrou. */
  enterFrom?: DoorSide;
  /** Acabou de descer para um nível novo (mostra "Nível N"). */
  newLevel?: boolean;
}

function weightedPick<T>(list: [T, number][]): T {
  let r = Math.random() * list.reduce((sum, [, w]) => sum + w, 0);
  for (const [v, w] of list) {
    if ((r -= w) < 0) return v;
  }
  return list[list.length - 1][0];
}

export class RoomScene extends Phaser.Scene {
  private run!: Run;
  private roomId: RoomId = '0,0';
  private enterFrom?: DoorSide;
  private newLevel = false;
  private enemies: Enemy[] = [];
  private enemyShots: EnemyShot[] = [];
  /** Grades nas portas enquanto há inimigos. */
  private bars = new Map<DoorSide, Phaser.GameObjects.Graphics>();
  private trapdoor?: { x: number; y: number };
  private bossName = 'Boss';
  /** Repor a sala de obstáculos: põe as bombas de teste de novo depois de recarregar a sala. */
  private devBombsOnRestart = false;
  private propObjs: PropObj[] = [];
  /** Slot do item usável no HUD. */
  private activeHud?: {
    box: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image;
    bar: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
  };
  /** 0 = chão, 1 = em cima da cadeira, 2 = em cima da mesa. */
  private playerHeight = 0;
  /** Inimigos que já soltaram o que tinham ao morrer. */
  private dropped = new Set<Enemy>();
  /** O jogo acabou com vitória: a sala para, mas os botões de recomeçar continuam. */
  private finished = false;
  private bossBar?: { fill: Phaser.GameObjects.Rectangle; boss: Enemy; parts: Phaser.GameObjects.GameObject[] };
  private player!: Player;
  private dummy?: DummyCat;
  private chest?: Chest;
  private moveKeys!: MoveKeys;
  private aimKeys!: AimKeys;
  private furballs: Furball[] = [];
  private spikeRects: Phaser.Geom.Rectangle[] = [];
  private hearts: Phaser.GameObjects.Image[] = [];
  private items: ItemPickup[] = [];
  private pickups: Pickup[] = [];
  private bombs: Bomb[] = [];
  private vendor?: Vendor;
  private npc?: Npc;
  private npcCooldownUntil = 0;
  private touch?: TouchControls;
  private readonly pad = new PadInput();
  /** Desenhos das portas trancadas desta sala, por lado. */
  private locks = new Map<DoorSide, Phaser.GameObjects.Graphics>();
  private cracks = new Map<DoorSide, Phaser.GameObjects.Graphics>();
  /** Evita repetir o aviso de "precisa de chave/moedas" a cada quadro. */
  private nagUntil = 0;
  /** Depois de destrancar, espera um pouco antes de deixar passar pela porta. */
  private doorPauseUntil = 0;
  private counters = new Map<PickupKind, Phaser.GameObjects.Text>();
  private counterIcons = new Map<PickupKind, Phaser.GameObjects.Image>();
  private heartRows = 1;
  private goldenKeyIcon?: Phaser.GameObjects.Image;
  private statTexts = new Map<string, Phaser.GameObjects.Text>();
  private banner?: Phaser.GameObjects.Container;
  private hint?: Phaser.GameObjects.Text;
  private leaving = false;
  private readonly move = new Phaser.Math.Vector2();

  constructor() {
    super('Room');
  }

  private get cat() {
    return this.run.cat;
  }

  private get roomState(): RoomState {
    return (this.run.rooms[this.roomId] ??= { items: [], pickups: [] });
  }

  private get roomDef(): RoomDef {
    return this.run.floor.rooms[this.roomId];
  }

  private get isDev() {
    return this.run.mode === 'dev';
  }

  /** Salas vizinhas desta sala, por lado da porta. */
  private get doors() {
    return neighbors(this.run.floor, this.roomId);
  }

  /** Multiplicador de dano dos inimigos: 1x no nível 1, +0,5x a cada nível (1; 1,5; 2; ...). */
  private get enemyDamageMult() {
    return 1 + ENEMY_DAMAGE_PER_LEVEL * (this.run.level - 1);
  }

  /**
   * Dano dos inimigos em pontos inteiros (meios corações), arredondado para baixo:
   * 1,5x tira meio coração; 2x tira um coração; 2,5x também tira um coração.
   */
  private get enemyDamage() {
    return Math.max(1, Math.floor(ENEMY_DAMAGE * this.enemyDamageMult));
  }

  /** Ainda há inimigos vivos (as portas ficam fechadas). */
  private get inCombat() {
    return this.enemies.some((e) => !e.dead);
  }

  /** Sem `run`, começa uma partida nova (vinda da seleção ou do R). */
  init(data: RoomData) {
    this.run = data.run ?? newRun(data.cat ?? 'black', data.mode ?? 'dev');
    this.roomId = data.room && this.run.floor.rooms[data.room] ? data.room : this.run.floor.startId;
    this.enterFrom = data.enterFrom;
    this.newLevel = !!data.newLevel;
  }

  create() {
    this.leaving = false;
    this.finished = false;
    this.propObjs = [];
    this.activeHud = undefined;
    this.playerHeight = 0;
    this.dropped.clear();
    this.furballs = [];
    this.spikeRects = [];
    this.items = [];
    this.pickups = [];
    this.hearts = [];
    this.banner = undefined;
    this.dummy = undefined;
    this.chest = undefined;
    this.bombs = [];
    this.vendor = undefined;
    this.npc = undefined;
    this.npcCooldownUntil = 0;
    this.enemies = [];
    this.enemyShots = [];
    this.bars.clear();
    this.trapdoor = undefined;
    this.bossBar = undefined;
    this.locks.clear();
    this.cracks.clear();
    this.nagUntil = 0;
    this.doorPauseUntil = 0;
    createFurballTexture(this, this.cat);
    drawRoom(this, Object.keys(this.doors) as DoorSide[]);
    this.physics.world.setBounds(FLOOR.x, FLOOR.y, FLOOR.width, FLOOR.height);

    for (const side of Object.keys(this.doors) as DoorSide[]) {
      if (this.run.floor.rooms[this.doors[side]!].type === 'boss') drawBossDoorMark(this, side);
      if (!this.isLocked(side)) continue;
      this.locks.set(side, drawLockedDoor(this, side));
      if (this.run.cracked.includes(doorKey(this.roomId, this.doors[side]!))) this.cracks.set(side, drawDoorCracks(this, side));
    }

    const firstVisit = !this.run.rooms[this.roomId];
    this.buildProps(firstVisit);
    for (const sc of this.roomState.scorches ?? []) drawScorch(this, sc.x, sc.y, sc.seed);
    const type = this.roomDef.type;
    if (type === 'devStart' || type === 'devActives') {
      this.drawSpikes();
      // Gato de teste parado no meio da sala.
      this.dummy = new DummyCat(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12, 'gray');
    } else if (type === 'treasure') {
      this.chest = new Chest(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, !!this.roomState.chestOpen);
    } else if (this.roomDef.chest) {
      // Sala comum com baú no meio (madeira abre sem chave; dourado precisa de chave)
      this.chest = new Chest(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, !!this.roomState.chestOpen, this.roomDef.chest);
    } else if (this.roomDef.item && firstVisit) {
      // Sala com item de graça no meio (sorteado pela sorte), guardado como item no chão
      const id = randomItemOf(rollRarity(this.run.stats.luck));
      this.roomState.items.push({ id, x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 + 30 });
    } else if (this.roomDef.npc) {
      // Gatinho pedinte ou vampiro (sala sem inimigos)
      const state = (this.roomState.npc ??= { given: 0, gone: false });
      if (!state.gone) this.npc = new Npc(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, this.roomDef.npc);
      if (type === 'devNpc' && (firstVisit || this.devBombsOnRestart)) this.addDevNpcSupplies();
    } else if (type === 'boss' && this.roomState.cleared) {
      this.placeTrapdoor(false);
    } else if (type === 'shop') {
      // O vendedor é um gato diferente do que você escolheu
      const vendorCat = PLAYABLE.find((c) => c !== this.cat && c !== 'black') ?? 'orange';
      this.vendor = new Vendor(this, GAME_WIDTH / 2, FLOOR.y + 120, vendorCat);
      if (firstVisit) this.stockShop();
    }
    // Itens que ficaram no chão da última vez que o gato esteve aqui
    for (const it of this.roomState.items) {
      this.items.push(new ItemPickup(this, it.x, it.y, it.id, { kind: 'none' }, it.price));
    }
    for (const p of this.roomState.pickups) this.pickups.push(new Pickup(this, p.x, p.y, p.kind, false, p.tag));
    if (firstVisit && (type === 'devStart' || type === 'devActives')) this.respawnItems(false);
    if ((firstVisit || this.devBombsOnRestart) && type === 'devProps') this.addDevBombs();
    this.devBombsOnRestart = false;

    const spawn = this.spawnPoint();
    this.player = new Player(this, spawn.x, spawn.y, this.cat, this.run.stats, this.run.hp, this.run.shield, spawn.facing);
    if (this.dummy) this.physics.add.collider(this.player.body, this.dummy.body);
    if (this.chest) this.physics.add.collider(this.player.body, this.chest.body, () => this.tryOpenChest());
    if (this.vendor) this.physics.add.collider(this.player.body, this.vendor.body);
    if (this.npc) this.physics.add.collider(this.player.body, this.npc.body, () => this.touchNpc());
    this.player.on('hp', () => this.updateHearts(true));
    this.player.on('stats', (stats: Stats) => this.updateStats(stats));
    this.player.loadActive(this.run.active);
    this.player.on('active', () => this.updateActiveHud(true));
    this.player.on('dead', () => this.showGameOver());

    // Salas com inimigos: fecha as portas até limpar
    this.addPropColliders();
    const peaceful = !!this.roomDef.npc; // sala de gatinho (como a loja) não tem inimigos
    if ((type === 'normal' || type === 'boss' || type === 'devProps') && !this.roomState.cleared && !peaceful) this.spawnEnemies(spawn);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.moveKeys = kb.addKeys({ w: K.W, a: K.A, s: K.S, d: K.D }) as MoveKeys;
    this.aimKeys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT }) as AimKeys;
    kb.addCapture([K.UP, K.DOWN, K.LEFT, K.RIGHT]); // não rolar a página com as setas
    kb.on('keydown-ESC', () => this.backToSelect());
    kb.on('keydown-E', () => this.placeBomb());
    kb.on('keydown-SPACE', () => this.useActive());
    kb.on('keydown-Q', () => this.useActive());
    kb.addCapture([K.SPACE]);
    this.touch = isTouchDevice(this)
      ? new TouchControls(this, () => this.placeBomb(), () => this.useActive())
      : undefined;

    this.createHud();

    if (this.newLevel) {
      const mult = this.enemyDamageMult.toFixed(1).replace('.', ',');
      this.time.delayedCall(250, () =>
        this.showBanner(`Nível ${this.run.level} de ${MAX_LEVEL}`, `Mais inimigos · dano deles ${mult}x`, '#f2c879'),
      );
    }
    if (!this.enterFrom && !this.newLevel) {
      this.hint = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - WALL - 28, this.touch ? 'Esquerda: andar  ·  direita: atirar e bomba' : 'WASD andar  ·  setas atirar  ·  E bomba', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#e8d9c4',
          stroke: '#1a1210',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setAlpha(0.85)
        .setDepth(10_000);
    }

    if (this.game.renderer.type === Phaser.WEBGL) {
      this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.3);
    }
    if (this.enterFrom) this.cameras.main.fadeIn(180);
  }

  /** Onde o gato aparece: na porta por onde entrou, ou embaixo do centro no começo. */
  private spawnPoint(): { x: number; y: number; facing: Facing } {
    const cy = GAME_HEIGHT / 2 + 10;
    switch (this.enterFrom) {
      case 'left':
        return { x: FLOOR.x + 36, y: cy, facing: 'right' };
      case 'right':
        return { x: FLOOR.x + FLOOR.width - 36, y: cy, facing: 'left' };
      case 'up':
        return { x: GAME_WIDTH / 2, y: FLOOR.y + 40, facing: 'down' };
      case 'down':
        return { x: GAME_WIDTH / 2, y: FLOOR.y + FLOOR.height - 20, facing: 'up' };
      default:
        return { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 + TILE * 2.5, facing: 'down' };
    }
  }

  update(time: number, deltaMs: number) {
    if (this.leaving || this.finished) return;
    // Limita o passo para a física não dar saltos se a aba ficar em segundo plano.
    const dt = Math.min(deltaMs, 50) / 1000;

    const k = this.moveKeys;
    this.move.set((k.d.isDown ? 1 : 0) - (k.a.isDown ? 1 : 0), (k.s.isDown ? 1 : 0) - (k.w.isDown ? 1 : 0));
    // Controle físico: analógico/direcional anda, A/B/X/Y atira, L bomba, R item, Start início
    this.pad.poll();
    if (this.pad.used && this.touch) this.touch.hide();
    const padMove = this.pad.move;
    if (padMove.x || padMove.y) this.move.set(padMove.x, padMove.y);
    if (this.pad.pressed(BTN.L1) || this.pad.pressed(BTN.L2)) this.placeBomb();
    if (this.pad.pressed(BTN.R1) || this.pad.pressed(BTN.R2)) this.useActive();
    if (this.pad.pressed(BTN.START)) this.backToSelect();
    if (this.touch && this.touch.move.lengthSq() > 0) this.move.copy(this.touch.move);
    const aim = this.currentAim() ?? this.pad.aim ?? this.touch?.aim ?? null;

    if (this.hint && (this.move.lengthSq() > 0 || aim)) {
      const hint = this.hint;
      this.hint = undefined;
      this.tweens.add({ targets: hint, alpha: 0, duration: 800, delay: 2000, onComplete: () => hint.destroy() });
    }

    this.updateElevation();
    const shot = this.player.update(this.move, aim, dt, time);
    if (shot) {
      this.furballs.push(
        new Furball(this, this.cat, shot.x, shot.y, shot.dir, shot.height, shot.inherited, shot.stats),
      );
    }

    for (const f of this.furballs) {
      f.update(dt);
      const { x, y } = f.position;
      if (this.dummy && !f.dead && this.dummy.hits(x, y, f.hitRadius)) {
        const d = f.direction;
        f.burst();
        this.dummy.takeHit(d.x, d.y, f.damage);
        if (this.showDamage) this.showDamageNumber(this.dummy.x, this.dummy.y - 70, f.damage);
      }
      // Pedras seguram a bola de pelo
      if (!f.dead && this.rockAt(x, y)) f.burst();
      for (const e of this.enemies) {
        if (f.dead || !e.hits(x, y, f.hitRadius)) continue;
        const d = f.direction;
        f.burst();
        e.takeHit(d.x, d.y, f.damage);
        if (this.showDamage) this.showDamageNumber(e.x, e.y - 50, f.damage);
      }
    }
    this.dummy?.update(time);
    this.vendor?.update(time);
    this.npc?.update(time);
    this.updateEnemies(dt, time);
    this.furballs = this.furballs.filter((f) => !f.dead);

    this.checkSpikes();
    this.checkItems(time);
    this.checkPickups(time);
    this.updateBombs(dt, time);
    if (this.player.active && this.player.activeCharge < 1) this.updateActiveHud(false);
    this.checkTrapdoor();
    this.checkDoors();
  }

  // ---------- Inimigos ----------

  /** Coloca os inimigos longe de onde o gato entrou e fecha as portas. */
  private spawnEnemies(from: { x: number; y: number }) {
    const level = this.run.level;
    if (this.roomDef.type === 'boss') {
      const bossType = BOSS_BY_LEVEL[Math.min(level, BOSS_BY_LEVEL.length) - 1];
      const boss = new Enemy(this, GAME_WIDTH / 2, FLOOR.y + 150, 'boss', level, bossType);
      this.enemies.push(boss);
      this.createBossBar(boss);
    } else {
      // 2 a 4 inimigos no nível 1, e mais um a cada nível (até 8)
      const kinds: EnemyKind[] =
        this.roomDef.type === 'devProps'
          ? ['fly', 'pale'] // teste: um que voa (alcança a mesa) e um de chão (não alcança)
          : Array.from({ length: Math.min(2 + Math.floor(Math.random() * 3) + (level - 1), 8) }, () => weightedPick(ENEMY_POOL));
      const count = kinds.length;
      const placed: { x: number; y: number }[] = [];
      for (let i = 0; i < count; i++) {
        let x = 0;
        let y = 0;
        for (let tries = 0; tries < 40; tries++) {
          x = Phaser.Math.Between(FLOOR.x + 70, FLOOR.x + FLOOR.width - 70);
          y = Phaser.Math.Between(FLOOR.y + 70, FLOOR.y + FLOOR.height - 50);
          const farFromCat = Phaser.Math.Distance.Between(x, y, from.x, from.y) > 260;
          const apart = placed.every((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) > 80);
          if (farFromCat && apart && !this.propAt(x, y) && !this.propAt(x, y - 40)) break;
        }
        placed.push({ x, y });
        this.enemies.push(new Enemy(this, x, y, kinds[i], level));
      }
    }
    // Quem anda no chão esbarra em pedras, buracos, móveis e no baú; quem voa passa por cima
    for (const e of this.enemies) {
      if (e.flies) continue;
      for (const o of this.propObjs) {
        if (o.body) this.physics.add.collider(e.body, o.body, undefined, () => !o.prop.broken);
      }
      if (this.chest) this.physics.add.collider(e.body, this.chest.body);
    }
    for (const side of Object.keys(this.doors) as DoorSide[]) {
      if (!this.isLocked(side)) this.bars.set(side, drawDoorBars(this, side));
    }
  }

  private updateEnemies(dt: number, time: number) {
    if (!this.enemies.length) return;
    const feet = this.player.feet;
    const world = {
      target: feet,
      shoot: (x: number, y: number, vx: number, vy: number, flying: boolean) =>
        this.enemyShots.push(new EnemyShot(this, x, y, vx, vy, flying)),
    };
    for (const e of this.enemies) {
      e.update(dt, time, world);
      // Encostar em qualquer inimigo (boss incluído) tira 1 de vida: meio coração
      // Em cima da mesa, só quem voa alcança o gato
      const reachable = this.playerHeight < 2 || e.flies;
      if (!e.dead && !e.spawning && !this.player.dead && reachable) {
        if (Phaser.Math.Distance.Between(feet.x, feet.y - 8, e.x, e.body.center.y) < e.radius + 14) {
          this.player.takeDamage(this.enemyDamage, e.x, e.y);
        }
      }
    }
    for (const shot of this.enemyShots) {
      shot.update(dt);
      const shotReaches = this.playerHeight < 2 || shot.fromFlyer;
      if (!shot.dead && !this.player.dead && shotReaches && Phaser.Math.Distance.Between(shot.x, shot.y, feet.x, feet.y) < 20) {
        shot.burst();
        this.player.takeDamage(this.enemyDamage, shot.x, shot.y);
      }
    }
    this.enemyShots = this.enemyShots.filter((s) => !s.dead);
    if (this.bossBar) {
      const { boss, fill } = this.bossBar;
      fill.width = 396 * Math.max(boss.hp, 0) / boss.maxHp;
    }

    for (const e of this.enemies) {
      if (e.dead && e.kind !== 'boss' && !this.dropped.has(e)) {
        this.dropped.add(e);
        this.enemyDrop(e.x, e.y);
      }
    }
    const wasFighting = this.enemies.length > 0;
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (wasFighting && !this.enemies.length) this.onRoomCleared();
  }

  /** Sala limpa: abre as portas e dá uma recompensa (no boss, o alçapão para o próximo nível). */
  private onRoomCleared() {
    this.roomState.cleared = true;
    for (const shot of this.enemyShots) shot.burst();
    this.enemyShots = [];
    for (const [side, g] of this.bars) {
      this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
      this.bars.delete(side);
    }
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 + 30;
    if (this.roomDef.type === 'boss') {
      this.bossName = this.bossBar?.boss.name ?? 'Boss';
      this.bossBar?.parts.forEach((p) => p.destroy());
      this.bossBar = undefined;
      if (this.run.level >= MAX_LEVEL) {
        // Último nível: fim de jogo com vitória
        this.time.delayedCall(1200, () => this.showVictory());
        return;
      }
      this.showBanner(`${this.bossName} derrotado!`, 'Desça pelo alçapão para o próximo nível', '#f2c879');
      this.placeTrapdoor(true);
      // Prêmio do boss: um item (a sorte ajuda) e um coração
      const id = randomItemOf(rollRarity(this.run.stats.luck));
      this.items.push(new ItemPickup(this, cx - 110, cy + 40, id, { kind: 'toss', fromX: cx, fromY: FLOOR.y + 120 }));
      this.pickups.push(new Pickup(this, cx + 110, cy + 40, 'heart', true));
      return;
    }
    const drop = weightedPick(CLEAR_DROPS);
    if (drop !== 'none') {
      const spot = this.freeDropSpot(cx, cy + (this.chest ? 70 : 0));
      this.pickups.push(new Pickup(this, spot.x, spot.y, drop, true));
    }
  }

  /** Sorteio do que um inimigo solta ao morrer: moeda 50%, chave/bomba 10%, item 5%. */
  private enemyDrop(x: number, y: number) {
    const drop = weightedPick(ENEMY_DROPS);
    if (drop === 'none') return;
    const spot = this.freeFloorSpot(x, y);
    if (drop === 'item') {
      const id = randomItemOf(rollRarity(this.run.stats.luck));
      this.items.push(new ItemPickup(this, spot.x, spot.y, id, { kind: 'pop' }));
    } else {
      this.pickups.push(new Pickup(this, spot.x, spot.y, drop, true));
    }
  }

  // ---------- Pedras, buracos e móveis ----------

  /** Monta os elementos da sala (sorteados na primeira visita e guardados na partida). */
  private buildProps(firstVisit: boolean) {
    const type = this.roomDef.type;
    if (!this.roomState.props) {
      this.roomState.props =
        type === 'normal' ? generateProps(Object.keys(this.doors) as DoorSide[]) : type === 'devProps' ? devPropsLayout() : [];
    }
    void firstVisit;
    for (const prop of this.roomState.props) this.propObjs.push(this.buildProp(prop));
  }

  private buildProp(prop: Prop): PropObj {
    const r = propRect(prop);
    const cx = r.x + r.w / 2;
    const bottom = r.y + r.h;
    if (prop.kind === 'hole') {
      // Buraco: poço escuro com borda de terra
      const g = this.add.graphics().setDepth(-58);
      g.fillStyle(0x2a1a10).fillRoundedRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 14);
      g.fillStyle(0x050302).fillRoundedRect(r.x + 8, r.y + 10, r.w - 16, r.h - 16, 12);
      g.fillStyle(0x000000, 0.6).fillRoundedRect(r.x + 8, r.y + 10, r.w - 16, 12, 8);
      const body = this.physics.add.staticBody(r.x + 8, r.y + 8, r.w - 16, r.h - 14);
      return { prop, body };
    }
    const tex = prop.kind === 'rock' ? (prop.broken ? 'rubble' : 'rock') : prop.broken ? `${prop.kind}_broken` : prop.kind;
    const lift = prop.kind === 'table' ? 14 : prop.kind === 'chair' ? 8 : 4;
    const sprite = this.add.image(cx, bottom + lift, tex).setOrigin(0.5, 1).setDepth(bottom);
    if (prop.broken) sprite.setDepth(-57); // destroços ficam no chão
    const body =
      prop.kind === 'table'
        ? this.physics.add.staticBody(r.x + 4, r.y + 8, r.w - 8, r.h - 12)
        : this.physics.add.staticBody(r.x + 8, r.y + 12, r.w - 16, r.h - 18);
    return { prop, body, sprite };
  }

  /** Colisões do gato: pedras e buracos sempre; a mesa só quando ele está no chão. */
  private addPropColliders() {
    for (const o of this.propObjs) {
      const p = o.prop;
      if (!o.body || p.kind === 'chair') continue;
      if (p.kind === 'table') {
        this.physics.add.collider(this.player.body, o.body, undefined, () => !p.broken && this.playerHeight === 0);
      } else {
        this.physics.add.collider(this.player.body, o.body, undefined, () => !p.broken);
      }
    }
  }

  /** Elemento (não destruído) no ponto do chão, se houver. */
  private propAt(x: number, y: number): Prop | undefined {
    const { col, row } = tileAt(x, y);
    const p = occupancy(this.roomState.props ?? []).get(`${col},${row}`);
    return p && !p.broken ? p : undefined;
  }

  private rockAt(x: number, y: number) {
    return this.propAt(x, y)?.kind === 'rock';
  }

  /**
   * Em cima de quê o gato está: cadeira (sobe direto do chão) ou mesa (só vindo da cadeira ou
   * já em cima dela). Ajusta a altura do desenho para ele aparecer em cima do móvel.
   */
  private updateElevation() {
    const feet = this.player.feet;
    const under = this.propAt(feet.x, feet.y - 8);
    let h = 0;
    if (under?.kind === 'chair') h = 1;
    else if (under?.kind === 'table' && this.playerHeight >= 1) h = 2;
    this.playerHeight = h;
    const bottom = under ? propRect(under).y + TILE + 2 : 0;
    this.player.setElevation(h === 1 ? CHAIR_LIFT : h === 2 ? TABLE_LIFT : 0, h ? bottom : 0);
  }

  /** Ponto livre mais perto de (x, y) para soltar algo no chão (fora de pedras, buracos e móveis). */
  private freeFloorSpot(x: number, y: number) {
    if (!this.propAt(x, y)) return { x, y };
    const { col, row } = tileAt(x, y);
    for (let radius = 1; radius < 6; radius++) {
      for (let dc = -radius; dc <= radius; dc++) {
        for (let dr = -radius; dr <= radius; dr++) {
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= ROOM_COLS || r >= ROOM_ROWS) continue;
          const spot = tileCenter(c, r);
          if (!this.propAt(spot.x, spot.y - 8)) return spot;
        }
      }
    }
    return { x, y };
  }

  /** Barra de vida do boss, embaixo da tela. */
  private createBossBar(boss: Enemy) {
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 26;
    const bg = this.add.rectangle(x, y, 404, 18, 0x120a0a, 0.85).setStrokeStyle(2, 0x3a1a1a).setDepth(39_000);
    const fill = this.add.rectangle(x - 198, y, 396, 10, 0xc8302a).setOrigin(0, 0.5).setDepth(39_001);
    const name = this.add
      .text(x, y - 20, boss.name, { fontFamily: 'monospace', fontSize: '14px', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(39_001);
    this.bossBar = { fill, boss, parts: [bg, fill, name] };
  }

  private placeTrapdoor(animate: boolean) {
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT / 2 - 10;
    const g = drawTrapdoor(this, x, y);
    if (animate) {
      g.setAlpha(0);
      this.tweens.add({ targets: g, alpha: 1, duration: 600 });
    }
    this.trapdoor = { x, y };
  }

  /** Pisar no alçapão leva ao próximo nível (mapa novo; a chave dourada é perdida). */
  private checkTrapdoor() {
    if (!this.trapdoor || this.leaving || this.player.dead) return;
    const feet = this.player.feet;
    if (Phaser.Math.Distance.Between(feet.x, feet.y, this.trapdoor.x, this.trapdoor.y) > 30) return;
    this.leaving = true;
    this.saveRoom();
    this.cameras.main.fadeOut(400);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // Só agora troca o mapa: a sala antiga não pode mais mexer no estado do nível novo
      startNextLevel(this.run);
      const data: RoomData = { run: this.run, room: this.run.floor.startId, newLevel: true };
      this.scene.restart(data);
    });
  }

  /** Se o gato está empurrando uma porta aberta, vai para a sala do outro lado. */
  private checkDoors() {
    if (this.player.dead || this.inCombat) return;
    const b = this.player.body;
    const feet = this.player.feet;
    const midY = Math.abs(feet.y - 10 - GAME_HEIGHT / 2) < 30;
    const midX = Math.abs(feet.x - GAME_WIDTH / 2) < 30;
    const pushing: Record<DoorSide, boolean> = {
      right: midY && this.move.x > 0 && b.right >= FLOOR.x + FLOOR.width - 1,
      left: midY && this.move.x < 0 && b.left <= FLOOR.x + 1,
      up: midX && this.move.y < 0 && b.top <= FLOOR.y + 1,
      down: midX && this.move.y > 0 && b.bottom >= FLOOR.y + FLOOR.height - 1,
    };
    for (const [side, target] of Object.entries(this.doors) as [DoorSide, RoomId][]) {
      if (!pushing[side] || this.time.now < this.doorPauseUntil) continue;
      if (this.isLocked(side)) this.tryUnlock(side);
      else this.goToRoom(target, OPPOSITE[side]);
      return;
    }
  }

  /** A porta está trancada? Fica trancada se uma das duas salas é trancada (ex.: a loja). */
  private isLocked(side: DoorSide) {
    const target = this.doors[side];
    if (!target) return false;
    const locked = this.roomDef.locked || this.run.floor.rooms[target].locked;
    return !!locked && !this.run.unlocked.includes(doorKey(this.roomId, target));
  }

  /** Gasta uma chave (ou usa a dourada) para destrancar a porta. */
  private tryUnlock(side: DoorSide) {
    if (this.time.now < this.nagUntil) return;
    const usedGolden = this.run.inventory.goldenKey;
    if (!useKey(this.run.inventory)) {
      this.nagUntil = this.time.now + 1500;
      this.showBanner('Trancada', 'Precisa de uma chave', '#c8c0b8');
      this.cameras.main.shake(80, 0.003);
      return;
    }
    this.updateCounters(usedGolden ? undefined : 'key');
    this.unlockDoor(side);
  }

  /** Abre a porta trancada: o cadeado cai e a porta some. */
  private unlockDoor(side: DoorSide) {
    this.run.unlocked.push(doorKey(this.roomId, this.doors[side]!));
    for (const g of [this.locks.get(side), this.cracks.get(side)]) {
      if (g) this.tweens.add({ targets: g, alpha: 0, y: g.y + 10, duration: 300, onComplete: () => g.destroy() });
    }
    this.locks.delete(side);
    this.cracks.delete(side);
    this.doorPauseUntil = this.time.now + 450; // dá tempo de ver a porta abrindo antes de passar
  }

  /**
   * Bomba perto de uma porta trancada: 50% de abrir na hora; senão ela racha, e a próxima
   * bomba abre com certeza.
   */
  private bombDoor(side: DoorSide) {
    const key = doorKey(this.roomId, this.doors[side]!);
    if (this.run.cracked.includes(key) || Math.random() < 0.5) {
      this.unlockDoor(side);
      this.showBanner('Porta aberta!', 'A explosão arrombou a porta', '#f2c879');
      return;
    }
    this.run.cracked.push(key);
    this.cracks.set(side, drawDoorCracks(this, side));
    this.showBanner('Porta rachada', 'Mais uma bomba e ela abre', '#c8c0b8');
  }

  private goToRoom(room: RoomId, enterFrom: DoorSide) {
    this.leaving = true;
    this.saveRoom();
    this.cameras.main.fadeOut(150);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const data: RoomData = { run: this.run, room, enterFrom };
      this.scene.restart(data);
    });
  }

  /** Guarda na partida o que precisa continuar igual quando o gato voltar. */
  private saveRoom() {
    this.run.hp = this.player.hp;
    this.run.shield = this.player.shield;
    this.run.active = this.player.active ? { id: this.player.active.id, charge: this.player.activeCharge } : undefined;
    this.roomState.items = this.items.filter((i) => !i.collected).map((i) => ({ id: i.info.id, x: i.x, y: i.y, price: i.price }));
    this.roomState.pickups = this.pickups.filter((p) => !p.collected).map((p) => ({ kind: p.kind, x: p.x, y: p.y, tag: p.tag }));
    if (this.chest) this.roomState.chestOpen = this.chest.opened;
  }

  /** Abre o baú e sorteia um item pela sorte do gato. */
  /** O baú é trancado: gasta uma chave (ou usa a dourada) para abrir. */
  private tryOpenChest() {
    if (!this.chest || this.chest.opened || this.time.now < this.nagUntil) return;
    if (this.chest.variant === 'wood') {
      this.openWoodChest();
      return;
    }
    const usedGolden = this.run.inventory.goldenKey;
    if (!useKey(this.run.inventory)) {
      this.nagUntil = this.time.now + 1500;
      this.showBanner('Baú trancado', 'Precisa de uma chave', '#c8c0b8');
      return;
    }
    if (!usedGolden) this.updateCounters('key');
    this.openChest();
  }

  /** Abre o baú dourado. Aberto com bomba (`factor` < 1), as chances de item bom caem. */
  private openChest(factor = 1) {
    if (!this.chest || !this.chest.open()) return;
    const rarity = rollRarity(this.run.stats.luck, Math.random, factor);
    const id = randomItemOf(rarity);
    const spot = this.freeDropSpot(this.chest.x, this.chest.y);
    this.items.push(
      new ItemPickup(this, spot.x, spot.y, id, { kind: 'toss', fromX: this.chest.x, fromY: this.chest.y - 30 }),
    );
    const info = RARITY_INFO[rarity];
    this.showBanner(`Item ${info.name.toLowerCase()}!`, ITEMS[id].name, info.color);
  }

  /** Baú de madeira: abre sem chave e solta 2 ou 3 coletáveis (às vezes um item). */
  private openWoodChest() {
    if (!this.chest || !this.chest.open()) return;
    const { x, y } = this.chest;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const spot = this.freeDropSpot(x, y);
      this.pickups.push(new Pickup(this, spot.x, spot.y, weightedPick(WOOD_CHEST_DROPS), true));
    }
    if (Math.random() < WOOD_CHEST_ITEM_CHANCE) {
      const spot = this.freeDropSpot(x, y);
      const id = randomItemOf(rollRarity(this.run.stats.luck));
      this.items.push(new ItemPickup(this, spot.x, spot.y, id, { kind: 'toss', fromX: x, fromY: y - 30 }));
    }
  }

  private freeDropSpot(cx: number, cy: number) {
    for (const [dx, dy] of DROP_SPOTS) {
      const x = cx + dx;
      const y = cy + dy;
      const taken =
        this.items.some((i) => !i.collected && Phaser.Math.Distance.Between(i.x, i.y, x, y) < 40) ||
        this.pickups.some((p) => !p.collected && Phaser.Math.Distance.Between(p.x, p.y, x, y) < 34);
      if (!taken && !this.propAt(x, y) && !this.propAt(x, y - 20)) return { x, y };
    }
    return { x: cx + Phaser.Math.Between(-120, 120), y: cy + Phaser.Math.Between(60, 140) };
  }

  /** Botão de teste: na sala inicial repõe os itens; na do tesouro, fecha o baú de novo. */
  private respawnItems(animate = true) {
    if (this.roomDef.type === 'devProps') {
      // Sala de obstáculos: tudo volta ao começo (pedras e móveis inteiros, baú fechado, inimigos)
      this.saveRoom();
      this.roomState.props = devPropsLayout();
      this.roomState.cleared = false;
      this.roomState.chestOpen = false;
      this.roomState.scorches = [];
      this.roomState.pickups = this.roomState.pickups.filter((p) => p.kind !== 'bomb');
      this.roomState.items = [];
      this.leaving = true;
      this.devBombsOnRestart = true;
      this.scene.restart({ run: this.run, room: this.roomId } satisfies RoomData);
      return;
    }
    if (this.roomDef.type === 'devNpc') {
      // O gatinho volta, e as moedas/corações de teste também
      this.saveRoom();
      this.roomState.npc = { given: 0, gone: false };
      this.roomState.pickups = [];
      this.devBombsOnRestart = true; // repõe também as moedas/corações de teste
      this.leaving = true;
      this.scene.restart({ run: this.run, room: this.roomId } satisfies RoomData);
      return;
    }
    if (this.chest) {
      if (this.chest.opened) this.chest.close();
      return;
    }
    if (this.vendor) {
      this.stockShop(true);
      return;
    }
    const spawn: ItemSpawn = animate ? { kind: 'pop' } : { kind: 'none' };
    if (this.roomDef.type === 'devActives') {
      for (const [id, col, row] of DEV_ACTIVE_ITEMS) {
        if (this.items.some((i) => !i.collected && i.info.id === id)) continue;
        const { x, y } = tileCenter(col, row);
        this.items.push(new ItemPickup(this, x, y, id, spawn));
      }
      return;
    }
    for (const [id, col, row] of TEST_ITEMS) {
      if (this.items.some((i) => !i.collected && i.info.id === id)) continue;
      const x = FLOOR.x + (col + 0.5) * TILE;
      const y = FLOOR.y + (row + 0.5) * TILE + 14;
      this.items.push(new ItemPickup(this, x, y, id, spawn));
    }
    TEST_PICKUPS.forEach(([kind, col, row], i) => {
      const tag = `test-${i}`;
      const x = FLOOR.x + (col + 0.5) * TILE;
      const y = FLOOR.y + (row + 0.5) * TILE + 14;
      if (this.pickups.some((p) => !p.collected && p.tag === tag)) return;
      this.pickups.push(new Pickup(this, x, y, kind, animate, tag));
    });
  }

  // ---------- Bombas ----------

  /** Coloca uma bomba nos pés do gato, se houver bombas no inventário. */
  private placeBomb() {
    if (this.leaving || this.player.dead || this.run.inventory.bombs <= 0) return;
    this.run.inventory.bombs -= 1;
    this.updateCounters('bomb');
    const feet = this.player.feet;
    const bomb = new Bomb(this, feet.x, feet.y + 2, (b) => this.explode(b));
    // O gato empurra a bomba, mas só depois de sair de cima dela.
    bomb.colliders.push(this.physics.add.collider(this.player.body, bomb.body, undefined, () => bomb.solid));
    if (this.dummy) bomb.colliders.push(this.physics.add.collider(bomb.body, this.dummy.body));
    for (const o of this.propObjs) {
      if (o.body) bomb.colliders.push(this.physics.add.collider(bomb.body, o.body, undefined, () => !o.prop.broken));
    }
    if (this.chest) bomb.colliders.push(this.physics.add.collider(bomb.body, this.chest.body));
    for (const other of this.bombs) {
      const c = this.physics.add.collider(bomb.body, other.body);
      bomb.colliders.push(c);
      other.colliders.push(c);
    }
    this.bombs.push(bomb);
  }

  private updateBombs(dt: number, time: number) {
    for (const bomb of this.bombs) {
      if (!bomb.solid && !this.physics.overlap(this.player.body, bomb.body)) bomb.solid = true;
      bomb.update(dt, time);
    }
    this.bombs = this.bombs.filter((b) => !b.exploded);
  }

  /** Explosão: dano por perto, marca no chão e tudo ao redor lançado para longe. */
  private explode(bomb: Bomb) {
    const { x, y } = bomb;
    playExplosion(this, x, y);
    // Baú por perto: abre sem chave (o dourado fica com chances piores, até a metade)
    if (this.chest && !this.chest.opened && Phaser.Math.Distance.Between(x, y, this.chest.x, this.chest.y) < BLAST_RADIUS + 20) {
      if (this.chest.variant === 'wood') this.openWoodChest();
      else this.openChest(Phaser.Math.FloatBetween(0.5, 1));
    }
    // Portas trancadas por perto: podem abrir ou rachar
    for (const side of Object.keys(this.doors) as DoorSide[]) {
      if (!this.isLocked(side)) continue;
      const d = DOOR_POS[side];
      // Ponto da porta na beira do chão
      const ex = Phaser.Math.Clamp(d.x, FLOOR.x, FLOOR.x + FLOOR.width);
      const ey = Phaser.Math.Clamp(d.y, FLOOR.y, FLOOR.y + FLOOR.height);
      if (Phaser.Math.Distance.Between(x, y, ex, ey) < BLAST_RADIUS + 20) this.bombDoor(side);
    }
    // Pedras, cadeiras e mesas por perto viram destroços (não são empurradas)
    for (const o of this.propObjs) {
      const p = o.prop;
      if (p.broken || !breakable(p)) continue;
      const r = propRect(p);
      const nx = Phaser.Math.Clamp(x, r.x, r.x + r.w);
      const ny = Phaser.Math.Clamp(y, r.y, r.y + r.h);
      if (Phaser.Math.Distance.Between(x, y, nx, ny) > BLAST_RADIUS - 20) continue;
      p.broken = true;
      const tex = p.kind === 'rock' ? 'rubble' : `${p.kind}_broken`;
      o.sprite?.setTexture(tex).setDepth(-57);
    }
    const seed = `${Date.now()}-${Math.random()}`;
    drawScorch(this, x, y, seed);
    (this.roomState.scorches ??= []).push({ x, y, seed });

    // Quanto mais perto, mais forte o empurrão (na direção oposta à bomba).
    const pushFrom = (px: number, py: number): { dx: number; dy: number } | null => {
      const d = Phaser.Math.Distance.Between(x, y, px, py);
      if (d > KNOCK_RADIUS) return null;
      const a = d < 1 ? Math.random() * Math.PI * 2 : Math.atan2(py - y, px - x);
      const strength = (1 - d / KNOCK_RADIUS) * KNOCK_MAX;
      return { dx: Math.cos(a) * strength, dy: Math.sin(a) * strength };
    };

    for (const item of this.items) {
      const push = pushFrom(item.x, item.y);
      if (push) item.knock(push.dx, push.dy);
    }
    for (const p of this.pickups) {
      const push = pushFrom(p.x, p.y);
      if (push) p.knock(push.dx, push.dy);
    }
    // Outras bombas por perto são lançadas e explodem em seguida
    for (const other of this.bombs) {
      if (other === bomb || other.exploded) continue;
      const push = pushFrom(other.x, other.y);
      if (!push) continue;
      other.body.velocity.set(push.dx * 2.2, push.dy * 2.2);
      if (Phaser.Math.Distance.Between(x, y, other.x, other.y) < BLAST_RADIUS) other.shortenFuse();
    }

    const feet = this.player.feet;
    if (Phaser.Math.Distance.Between(x, y, feet.x, feet.y) < BLAST_RADIUS) {
      this.player.takeDamage(BOMB_DAMAGE_PLAYER, x, y);
    }
    for (const e of this.enemies) {
      if (e.dead || Phaser.Math.Distance.Between(x, y, e.x, e.y) > BLAST_RADIUS + e.radius) continue;
      const a = Math.atan2(e.y - y, e.x - x);
      e.takeHit(Math.cos(a), Math.sin(a), BOMB_DAMAGE_ENEMY);
      if (this.showDamage) this.showDamageNumber(e.x, e.y - 50, BOMB_DAMAGE_ENEMY);
    }
    if (this.dummy?.alive && Phaser.Math.Distance.Between(x, y, this.dummy.x, this.dummy.y) < BLAST_RADIUS + 20) {
      const a = Math.atan2(this.dummy.y - y, this.dummy.x - x);
      this.dummy.takeHit(Math.cos(a), Math.sin(a), BOMB_DAMAGE_ENEMY);
      if (this.showDamage) this.showDamageNumber(this.dummy.x, this.dummy.y - 70, BOMB_DAMAGE_ENEMY);
    }
  }

  private checkPickups(time: number) {
    const feet = this.player.feet;
    for (const p of this.pickups) {
      p.update(time);
      if (this.player.dead || !p.touches(feet.x, feet.y)) continue;
      // Coração vermelho com a vida cheia fica no chão, como no Isaac.
      if ((p.kind === 'heart' || p.kind === 'halfHeart') && this.player.hp >= this.player.maxPoints) continue;
      const target = this.counterPosition(p.kind);
      p.collect(target.x, target.y, () => {
        if (p.kind === 'blueHeart') this.player.addShield(HEART_POINTS.blueHeart!);
        else if (isHeart(p.kind)) this.player.heal(HEART_POINTS[p.kind]!);
        else {
          addPickup(this.run.inventory, p.kind);
          this.updateCounters(p.kind);
        }
      });
      if (p.kind === 'goldenKey') this.showBanner('Chave dourada', 'Abre portas e baús sem gastar chaves neste nível', '#f2c879');
    }
    this.pickups = this.pickups.filter((p) => !p.collected);
  }

  /** Põe à venda itens sorteados nos espaços vazios da bancada (3 no total). */
  private stockShop(animate = false) {
    const slots = [-1, 0, 1].map((i) => ({ x: GAME_WIDTH / 2 + i * SHOP_ITEM_GAP, y: SHOP_ITEM_Y }));
    const free = slots.filter((s) => !this.items.some((it) => !it.collected && it.x === s.x && it.y === s.y));
    const forSale = this.items.filter((it) => !it.collected).map((it) => it.info.id);
    const ids = rollShopItems(this.run.stats.luck, free.length, forSale);
    free.forEach((slot, i) => {
      const id = ids[i];
      this.items.push(new ItemPickup(this, slot.x, slot.y, id, animate ? { kind: 'pop' } : { kind: 'none' }, priceOf(id)));
    });
  }

  /** Compra um item da loja, se houver moedas. */
  private tryBuy(item: ItemPickup) {
    const price = item.price ?? 0;
    if (this.run.inventory.coins < price) {
      if (this.time.now >= this.nagUntil) {
        this.nagUntil = this.time.now + 1500;
        this.vendor?.say(`Faltam ${price - this.run.inventory.coins} moedas!`);
      }
      return false;
    }
    this.run.inventory.coins -= price;
    this.updateCounters('coin');
    this.vendor?.say('Obrigado! Miau!', true);
    return true;
  }

  private checkItems(time: number) {
    const feet = this.player.feet;
    for (const item of this.items) {
      item.update(time);
      if (!this.player.dead && item.touches(feet.x, feet.y)) {
        if (item.price !== undefined && !this.tryBuy(item)) continue;
        item.collect(feet.x, feet.y);
        const old = this.player.collect(item.info);
        // Trocou de item usável: o antigo fica no chão onde estava o novo
        if (old) this.items.push(new ItemPickup(this, item.x, item.y, old.id, { kind: 'drop' }));
        const rarity = RARITY_INFO[item.info.rarity];
        this.showBanner(item.info.name, `${item.info.effect}  ·  ${rarity.name}`, rarity.color);
      }
    }
    this.items = this.items.filter((i) => !i.collected);
  }

  /** A seta pressionada por último manda, como no Isaac. */
  private currentAim(): Facing | null {
    let best: Facing | null = null;
    let bestTime = -Infinity;
    for (const dir of Object.keys(this.aimKeys) as Facing[]) {
      const key = this.aimKeys[dir];
      if (key.isDown && key.timeDown > bestTime) {
        best = dir;
        bestTime = key.timeDown;
      }
    }
    return best;
  }

  private checkSpikes() {
    if (this.player.dead) return;
    const feet = this.player.body;
    const feetRect = new Phaser.Geom.Rectangle(feet.x, feet.y, feet.width, feet.height);
    for (const r of this.spikeRects) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(feetRect, r)) {
        this.player.takeDamage(1, r.centerX, r.centerY);
        return;
      }
    }
  }

  // ---------- HUD ----------

  private createHud() {
    this.createCounters();
    this.updateHearts(false);
    this.createActiveHud();
    this.createTopButtons();
    if (this.isDev) this.createStatsPanel();
    else this.createMinimap();
  }

  // ---------- Item usável ----------

  private useActive() {
    if (this.leaving || this.finished) return;
    const item = this.player.active;
    if (!item?.active) return;
    if (!this.player.useActive()) {
      if (this.time.now >= this.nagUntil) {
        this.nagUntil = this.time.now + 800;
        this.showBanner(item.name, 'Ainda recarregando…', '#c8c0b8');
      }
      return;
    }
    const what = item.active.effect === 'invincible' ? 'Imortal' : 'Dano 2x';
    this.showBanner(item.name, `${what} por ${item.active.duration} segundos!`, '#f2c879');
  }

  /** Slot do item usável, embaixo dos contadores: ícone, barra de recarga e a tecla. */
  private createActiveHud() {
    const { x, y } = this.activeSlotPosition();
    const box = this.add.rectangle(x, y, 44, 44, 0x120e0c, 0.7).setStrokeStyle(2, 0x8a7a6a).setDepth(20_000);
    const icon = this.add.image(x, y - 1, 'actives', 0).setScale(0.58).setDepth(20_001);
    const bar = this.add.rectangle(x - 20, y + 26, 40, 5, 0xf2c879).setOrigin(0, 0.5).setDepth(20_001);
    const label = this.add
      .text(x + 28, y, this.touch ? '' : 'Espaço', { fontFamily: 'monospace', fontSize: '11px', color: '#8a7a6a' })
      .setOrigin(0, 0.5)
      .setDepth(20_001);
    this.activeHud = { box, icon, bar, label };
    this.updateActiveHud(false);
  }

  private activeSlotPosition() {
    const keyRow = this.counterPosition('key');
    return { x: 48, y: keyRow.y + 42 };
  }

  private updateActiveHud(bump: boolean) {
    const hud = this.activeHud;
    if (!hud) return;
    const item = this.player.active;
    const visible = !!item;
    for (const o of [hud.box, hud.icon, hud.bar, hud.label]) o.setVisible(visible);
    this.touch?.setActive(item ? item.frame : null, this.player.activeCharge >= 1);
    if (!item) return;
    hud.icon.setFrame(item.frame);
    const ready = this.player.activeCharge >= 1;
    hud.bar.width = 40 * this.player.activeCharge;
    hud.bar.setFillStyle(ready ? 0xf2c879 : 0x6a5a4a);
    hud.icon.setAlpha(ready ? 1 : 0.5);
    hud.box.setStrokeStyle(2, ready ? 0xf2c879 : 0x8a7a6a);
    if (bump) {
      hud.icon.setScale(0.8);
      this.tweens.add({ targets: hud.icon, scale: 0.58, duration: 250, ease: 'Back.Out' });
    }
  }

  // ---------- Gatinhos pedinte e vampiro ----------

  /** Encostar no gatinho: o pedinte recebe 1 moeda; o vampiro, 1 ponto de vida. */
  private touchNpc() {
    const npc = this.npc;
    if (!npc || npc.gone || this.player.dead || this.time.now < this.npcCooldownUntil) return;
    this.npcCooldownUntil = this.time.now + 700;
    const state = (this.roomState.npc ??= { given: 0, gone: false });
    let chance: number;
    if (npc.kind === 'beggar') {
      if (this.run.inventory.coins <= 0) {
        npc.say('Sem moedinha? Tudo bem…');
        return;
      }
      this.run.inventory.coins -= 1;
      this.updateCounters('coin');
      chance = BEGGAR_ITEM_CHANCE;
    } else {
      // Não deixa o gato morrer doando: precisa sobrar pelo menos meio coração
      if (this.player.hp <= 1) {
        npc.say('Você está fraquinho demais…');
        return;
      }
      this.player.donateBlood(1);
      this.run.bloodDonated += 1;
      chance = VAMPIRE_ITEM_CHANCE;
      this.checkVampireReward();
    }
    npc.thank();
    if (Math.random() >= chance) {
      npc.say(npc.kind === 'beggar' ? 'Obrigado!' : 'Hmm… delícia.');
      return;
    }
    // Presente: item com as mesmas chances do baú (a sorte ajuda)
    const id = randomItemOf(rollRarity(this.run.stats.luck));
    const spot = this.freeDropSpot(npc.x, npc.y);
    this.items.push(new ItemPickup(this, spot.x, spot.y, id, { kind: 'toss', fromX: npc.x, fromY: npc.y - 40 }));
    state.given += 1;
    if (state.given >= NPC_MAX_ITEMS) {
      state.gone = true;
      npc.leave(npc.kind === 'beggar' ? 'Valeu! Até mais!' : 'Satisfeito. Adeus!');
    } else {
      npc.say('Um presentinho pra você!');
    }
  }

  /** Doou 3 corações no total e ficou com meio coração: ganha a capa de vampiro (uma vez). */
  private checkVampireReward() {
    if (this.run.vampireReward || this.run.bloodDonated < VAMPIRE_REWARD_BLOOD || this.player.hp !== 1) return;
    this.run.vampireReward = true;
    const feet = this.player.feet;
    const spot = this.freeDropSpot(feet.x, feet.y - 40);
    this.items.push(new ItemPickup(this, spot.x, spot.y, 'vampire', { kind: 'pop' }));
    this.showBanner('Presente do vampiro!', 'Uma capa e dois dentinhos', '#c83040');
  }

  /** Moedas e corações para testar os gatinhos (modo desenvolvedor). */
  private addDevNpcSupplies() {
    const kind: PickupKind = this.roomDef.npc === 'beggar' ? 'coin' : 'heart';
    for (let i = 0; i < 6; i++) {
      const { x, y } = tileCenter(2 + (i % 3), 1 + Math.floor(i / 3) * 4);
      this.pickups.push(new Pickup(this, x, y, kind, false));
    }
  }

  /** Bombas de teste na sala de obstáculos (modo desenvolvedor). */
  private addDevBombs() {
    for (const [col, row] of DEV_PROPS_BOMBS) {
      const { x, y } = tileCenter(col, row);
      this.pickups.push(new Pickup(this, x, y, 'bomb', false));
    }
  }

  /** Contadores de moedas, bombas e chaves embaixo dos corações (como no Isaac). */
  private createCounters() {
    this.counters.clear();
    this.counterIcons.clear();
    for (const kind of ['coin', 'bomb', 'key'] as PickupKind[]) {
      const { x, y } = this.counterPosition(kind);
      this.counterIcons.set(kind, this.add.image(x, y, 'pickups', PICKUP_FRAME[kind]).setScale(0.5).setDepth(20_000));
      this.counters.set(
        kind,
        this.add
          .text(x + 16, y, '', { fontFamily: 'monospace', fontSize: '16px', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 4 })
          .setOrigin(0, 0.5)
          .setDepth(20_000),
      );
    }
    const keyPos = this.counterPosition('goldenKey');
    this.goldenKeyIcon = this.add
      .image(keyPos.x, keyPos.y, 'pickups', PICKUP_FRAME.goldenKey)
      .setScale(0.5)
      .setDepth(20_000);
    this.updateCounters();
  }

  /**
   * Para onde cada coletável voa no HUD. Moedas, bombas e chaves vão para o contador
   * (a chave dourada fica ao lado das chaves); corações vão para o espaço que vão ocupar.
   */
  private counterPosition(kind: PickupKind): { x: number; y: number } {
    const x = 38;
    const top = 70 + (this.heartRows - 1) * HEART_ROW_H; // desce se houver mais linhas de corações
    const gap = 24;
    switch (kind) {
      case 'coin':
        return { x, y: top };
      case 'bomb':
        return { x, y: top + gap };
      case 'key':
        return { x, y: top + gap * 2 };
      case 'goldenKey':
        return { x, y: top + gap * 2 }; // no mesmo lugar da prateada
      case 'blueHeart':
        return this.heartSlot(this.player.stats.maxHp + Math.floor(this.player.shield / 2), true);
      default:
        return this.heartSlot(Math.min(Math.floor(this.player.hp / 2), this.player.stats.maxHp - 1), true);
    }
  }

  /** Posição do coração número `i` no HUD (canto superior esquerdo, ou centro com `center`). */
  private heartSlot(i: number, center = false) {
    const x = 26 + (i % HEARTS_PER_ROW) * HEART_GAP;
    const y = 22 + Math.floor(i / HEARTS_PER_ROW) * HEART_ROW_H;
    return center ? { x: x + 16, y: y + 15 } : { x, y };
  }

  /** Reposiciona os contadores quando os corações ganham ou perdem uma linha. */
  private layoutCounters() {
    for (const kind of ['coin', 'bomb', 'key'] as PickupKind[]) {
      const { x, y } = this.counterPosition(kind);
      this.counterIcons.get(kind)?.setPosition(x, y);
      this.counters.get(kind)?.setPosition(x + 16, y);
    }
    const g = this.counterPosition('goldenKey');
    this.goldenKeyIcon?.setPosition(g.x, g.y);
    if (this.activeHud) {
      const { x, y } = this.activeSlotPosition();
      this.activeHud.box.setPosition(x, y);
      this.activeHud.icon.setPosition(x, y - 1);
      this.activeHud.bar.setPosition(x - 20, y + 26);
      this.activeHud.label.setPosition(x + 28, y);
    }
  }

  private updateCounters(bump?: PickupKind) {
    const inv = this.run.inventory;
    const values: [PickupKind, number][] = [
      ['coin', inv.coins],
      ['bomb', inv.bombs],
      ['key', inv.keys],
    ];
    for (const [kind, value] of values) {
      const text = this.counters.get(kind)!;
      text.setText(String(value).padStart(2, '0'));
      if (bump === kind) {
        text.setScale(1.4);
        this.tweens.add({ targets: text, scale: 1, duration: 200, ease: 'Back.Out' });
      }
    }
    // A chave dourada fica por cima da prateada no contador
    this.goldenKeyIcon?.setVisible(inv.goldenKey);
    this.counterIcons.get('key')?.setVisible(!inv.goldenKey);
    if (bump === 'goldenKey' && this.goldenKeyIcon) {
      this.goldenKeyIcon.setScale(1.3);
      this.tweens.add({ targets: this.goldenKeyIcon, scale: 0.5, duration: 300, ease: 'Back.Out' });
    }
  }

  /** Painel pequeno com os status, abaixo do botão Início (para testes durante o desenvolvimento). */
  private createStatsPanel() {
    const right = GAME_WIDTH - 20;
    const top = 58;
    const lineH = 15;
    const w = 132;
    // Status + título "Chances do baú" + uma linha por raridade
    const lines = STAT_LABELS.length + 1 + RARITY_ORDER.length;
    this.add
      .rectangle(right, top - 4, w, lines * lineH + 12, 0x120e0c, 0.6)
      .setOrigin(1, 0)
      .setDepth(40_000);
    this.statTexts.clear();
    STAT_LABELS.forEach(([key, label], i) => {
      const y = top + i * lineH;
      this.add
        .text(right - w + 8, y, label, { fontFamily: 'monospace', fontSize: '12px', color: '#b8a898' })
        .setDepth(40_001);
      this.statTexts.set(
        key,
        this.add
          .text(right - 8, y, '', { fontFamily: 'monospace', fontSize: '12px', color: '#e8d9c4' })
          .setOrigin(1, 0)
          .setDepth(40_001),
      );
    });

    // Chances de cada raridade no baú (mudam com a sorte)
    const oddsTop = top + STAT_LABELS.length * lineH + 6;
    this.add
      .text(right - w + 8, oddsTop, 'Chances do baú', { fontFamily: 'monospace', fontSize: '11px', color: '#8a7a6a' })
      .setDepth(40_001);
    RARITY_ORDER.forEach((r, i) => {
      const y = oddsTop + (i + 1) * lineH;
      const color = RARITY_INFO[r].color;
      this.add
        .text(right - w + 8, y, RARITY_INFO[r].name, { fontFamily: 'monospace', fontSize: '12px', color })
        .setDepth(40_001);
      this.statTexts.set(
        `odds_${r}`,
        this.add
          .text(right - 8, y, '', { fontFamily: 'monospace', fontSize: '12px', color })
          .setOrigin(1, 0)
          .setDepth(40_001),
      );
    });
    this.updateStats(this.player.stats, false);
  }

  private updateStats(stats: Stats, flash = true) {
    if (!this.statTexts.size) return; // o painel só existe no modo desenvolvedor
    for (const [key] of STAT_LABELS) {
      const text = this.statTexts.get(key)!;
      const value = key === 'maxHp' ? `${stats.maxHp}` : formatMult(stats[key]);
      if (flash && text.text !== value) {
        // Destaca em dourado o status que acabou de mudar
        text.setColor('#f2c879').setScale(1.25);
        this.tweens.add({ targets: text, scale: 1, duration: 300, ease: 'Back.Out' });
        this.time.delayedCall(1200, () => text.active && text.setColor('#e8d9c4'));
      }
      text.setText(value);
    }
    const odds = rarityOdds(stats.luck);
    for (const r of RARITY_ORDER) {
      this.statTexts.get(`odds_${r}`)!.setText(`${String(odds[r]).replace('.', ',')}%`);
    }
  }

  /** Número de dano que sobe e some acima do inimigo. */
  private showDamageNumber(x: number, y: number, amount: number) {
    const value = (Math.round(amount * 10) / 10).toString().replace('.', ',');
    const text = this.add
      .text(x + Phaser.Math.Between(-16, 16), y, value, {
        fontFamily: 'monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#a0201c',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(30_000)
      .setScale(0.5);
    this.tweens.add({ targets: text, scale: 1.15, duration: 120, ease: 'Back.Out' });
    this.tweens.add({
      targets: text,
      y: y - 36,
      alpha: 0,
      delay: 250,
      duration: 550,
      ease: 'Quad.In',
      onComplete: () => text.destroy(),
    });
  }

  /** Faixa no topo com o nome do item e o efeito, como no Isaac. */
  private showBanner(title: string, subtitle: string, color = '#f2c879') {
    this.banner?.destroy();
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210' };
    const t1 = this.add.text(0, 0, title, { ...style, fontSize: '26px', strokeThickness: 6, color }).setOrigin(0.5);
    const t2 = this.add.text(0, 30, subtitle, { ...style, fontSize: '16px', strokeThickness: 4 }).setOrigin(0.5);
    const banner = this.add.container(GAME_WIDTH / 2, 110, [t1, t2]).setDepth(35_000).setAlpha(0);
    this.banner = banner;
    banner.y = 96;
    this.tweens.add({ targets: banner, alpha: 1, y: 110, duration: 200, ease: 'Quad.Out' });
    this.tweens.add({
      targets: banner,
      alpha: 0,
      delay: 1800,
      duration: 400,
      onComplete: () => banner.destroy(),
    });
  }

  /** Botões no topo, à direita: alternar números de dano, repor itens e voltar ao início. */
  private createTopButtons() {
    const y = 31;
    this.makeButton(GAME_WIDTH - 20 - 66, y, 132, '↺ Início (Esc)', () => this.backToSelect());
    if (!this.isDev) return; // os botões de teste só existem no modo desenvolvedor
    const type = this.roomDef.type;
    const refill = type === 'treasure' ? '+ Novo baú' : type === 'shop' ? '+ Repor loja' : type === 'devNpc' ? '+ Repor gatinho' : '+ Repor itens';
    this.makeButton(GAME_WIDTH - 162 - 56, y, 112, refill, () => this.respawnItems());
    const damageButton = this.makeButton(GAME_WIDTH - 284 - 58, y, 116, '', () => {
      this.registry.set('showDamage', !this.showDamage);
      damageButton.setText(this.damageLabel());
    });
    damageButton.setText(this.damageLabel());
  }

  private get showDamage(): boolean {
    return this.isDev && (this.registry.get('showDamage') ?? true);
  }

  /**
   * Minimapa no canto superior direito (modo jogo): salas visitadas, vizinhas já vistas e os
   * ícones do tesouro, da loja e do boss.
   */
  private createMinimap() {
    const floor = this.run.floor;
    const visited = new Set(Object.keys(this.run.rooms).filter((id) => floor.rooms[id]));
    visited.add(this.roomId);
    const known = new Set(visited);
    for (const id of visited) for (const n of Object.values(neighbors(floor, id))) known.add(n!);
    const rooms = [...known].map((id) => floor.rooms[id]);
    const minX = Math.min(...rooms.map((r) => r.gx));
    const maxX = Math.max(...rooms.map((r) => r.gx));
    const minY = Math.min(...rooms.map((r) => r.gy));
    const maxY = Math.max(...rooms.map((r) => r.gy));
    const cw = 22;
    const ch = 15;
    const gap = 4;
    const w = (maxX - minX + 1) * (cw + gap) + gap;
    const h = (maxY - minY + 1) * (ch + gap) + gap;
    const right = GAME_WIDTH - 20;
    const top = 58;
    const left = right - Math.max(w, 90);
    const depth = 40_000;
    this.add.rectangle(left - 6, top - 6, Math.max(w, 90) + 12, h + 30, 0x0c0907, 0.75).setOrigin(0, 0).setDepth(depth);
    const g = this.add.graphics().setDepth(depth + 1);
    for (const r of rooms) {
      const x = left + gap + (r.gx - minX) * (cw + gap);
      const y = top + gap + (r.gy - minY) * (ch + gap);
      const color = r.id === this.roomId ? 0xf2e6cf : visited.has(r.id) ? 0x8a7a6a : 0x3a322e;
      g.fillStyle(color).fillRoundedRect(x, y, cw, ch, 3);
      const icon = r.type === 'treasure' ? 0xe2b13c : r.type === 'shop' ? 0x7ad67a : r.type === 'boss' ? 0xd8302a : 0;
      if (icon) {
        g.fillStyle(0x0c0907).fillCircle(x + cw / 2, y + ch / 2, 5);
        g.fillStyle(icon).fillCircle(x + cw / 2, y + ch / 2, 4);
      }
    }
    this.add
      .text(left, top + h + 4, `Nível ${this.run.level}/${MAX_LEVEL}`, { fontFamily: 'monospace', fontSize: '12px', color: '#b8a898' })
      .setDepth(depth + 1);
  }

  private damageLabel() {
    return this.showDamage ? 'Dano: ligado' : 'Dano: desligado';
  }

  /** Cria um botão arredondado centrado em (x, y). Retorna o texto para poder trocar o rótulo. */
  private makeButton(x: number, y: number, w: number, text: string, onClick: () => void) {
    const h = 34;
    const bg = this.add.graphics();
    const draw = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? 0x5a4a3c : 0x2a2220, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(2, hover ? 0xf2c879 : 0x8a7a6a).strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    };
    draw(false);
    const label = this.add
      .text(0, 0, text, { fontFamily: 'monospace', fontSize: '14px', color: '#e8d9c4' })
      .setOrigin(0.5);
    const button = this.add.container(x, y, [bg, label]).setDepth(40_000).setSize(w, h);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerover', () => draw(true));
    button.on('pointerout', () => draw(false));
    button.on('pointerdown', () => {
      onClick();
      this.tweens.add({ targets: button, scale: 0.92, duration: 60, yoyo: true });
    });
    return label;
  }

  /** Volta para a tela de seleção, mantendo o gato atual pré-selecionado. */
  private backToSelect() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(200);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start('Select', { cat: this.cat, mode: this.run.mode }),
    );
  }

  /**
   * Desenha os corações: primeiro os vermelhos (cheio, metade ou vazio, 2 pontos cada),
   * depois os azuis do escudo (cheio ou metade). Até 8 por linha.
   */
  private updateHearts(animate: boolean) {
    const { hp, shield } = this.player;
    const maxHp = this.player.stats.maxHp;
    const frames: number[] = [];
    for (let i = 0; i < maxHp; i++) {
      // A vida pode ter frações (dano 1,5x): qualquer pedaço de coração aparece como metade
      const pts = Phaser.Math.Clamp(hp - i * 2, 0, 2);
      frames.push(pts >= 2 ? 0 : pts > 0 ? 2 : 1);
    }
    for (let i = 0; i < Math.ceil(shield / 2 - 1e-9); i++) {
      frames.push(shield - i * 2 >= 2 ? 3 : 4);
    }

    // Some com os corações que deixaram de existir (escudo perdido)
    while (this.hearts.length > frames.length) {
      const heart = this.hearts.pop()!;
      if (animate) {
        this.tweens.add({ targets: heart, scale: 0, alpha: 0, duration: 250, onComplete: () => heart.destroy() });
      } else heart.destroy();
    }
    frames.forEach((frame, i) => {
      let heart = this.hearts[i];
      if (!heart) {
        const pos = this.heartSlot(i);
        heart = this.add.image(pos.x + 16, pos.y + 15, 'hearts', frame).setDepth(20_000);
        if (animate) {
          heart.setScale(0);
          this.tweens.add({ targets: heart, scale: 1, duration: 300, ease: 'Back.Out' });
        }
        this.hearts.push(heart);
        return;
      }
      const before = Number(heart.frame.name);
      if (before === frame) return;
      heart.setFrame(frame);
      if (animate) {
        // Pulsa mais forte quando perde vida, mais leve quando ganha
        const lost = frame === 1 || (before === 0 && frame === 2) || (before === 3 && frame === 4);
        heart.setScale(lost ? 1.5 : 1.25);
        this.tweens.add({ targets: heart, scale: 1, duration: 250, ease: 'Back.Out' });
      }
    });

    const rows = Math.max(1, Math.ceil(frames.length / HEARTS_PER_ROW));
    if (rows !== this.heartRows) {
      this.heartRows = rows;
      this.layoutCounters();
    }
  }

  /** Tela de vitória depois do boss do último nível. */
  private showVictory() {
    this.finished = true; // o gato para; nada mais acontece na sala
    this.player.body.velocity.set(0, 0);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setDepth(30_000);
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 6 };
    const title = this.add
      .text(cx, cy - 40, 'Você venceu!', { ...style, fontSize: '52px', color: '#f2c879' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    const detail = this.add
      .text(cx, cy + 14, `Os ${MAX_LEVEL} porões estão livres dos monstros.`, { ...style, fontSize: '20px', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    const sub = this.add
      .text(cx, cy + 56, this.touch ? 'Toque para jogar de novo' : 'R para jogar de novo  ·  Esc para trocar de gato', {
        ...style,
        fontSize: '18px',
        strokeThickness: 4,
        color: '#b8a898',
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    this.tweens.add({ targets: overlay, fillAlpha: 0.6, duration: 700 });
    this.tweens.add({ targets: [title, detail, sub], alpha: 1, duration: 700, delay: 300 });
    title.setScale(0.6);
    this.tweens.add({ targets: title, scale: 1, duration: 700, delay: 300, ease: 'Back.Out' });

    const again: RoomData = { cat: this.cat, mode: this.run.mode };
    this.input.keyboard!.once('keydown-R', () => this.scene.restart(again));
    this.waitPadButton(() => this.scene.restart(again));
    this.time.delayedCall(1000, () => {
      overlay.setInteractive();
      overlay.once('pointerdown', () => this.scene.restart(again));
    });
  }

  /** Depois de um instante, A ou Start no controle executa `action` (fim de jogo/vitória). */
  private waitPadButton(action: () => void) {
    this.time.delayedCall(900, () => {
      const timer = this.time.addEvent({
        delay: 50,
        loop: true,
        callback: () => {
          this.pad.poll();
          if (this.pad.pressed(BTN.A) || this.pad.pressed(BTN.START)) {
            timer.remove();
            action();
          }
        },
      });
    });
  }

  private showGameOver() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setDepth(30_000);
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 6 };
    const title = this.add
      .text(cx, cy - 20, 'Fim de jogo', { ...style, fontSize: '48px' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    const sub = this.add
      .text(cx, cy + 34, this.touch ? 'Toque para recomeçar' : 'R para recomeçar  ·  Esc para trocar de gato', { ...style, fontSize: '20px', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    this.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 600, delay: 400 });
    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 600, delay: 600 });

    const kb = this.input.keyboard!;
    const restart: RoomData = { cat: this.cat, mode: this.run.mode };
    kb.once('keydown-R', () => this.scene.restart(restart));
    this.waitPadButton(() => this.scene.restart(restart));
    // No celular: tocar na tela recomeça (o botão Início continua levando à seleção)
    this.time.delayedCall(900, () => {
      overlay.setInteractive();
      overlay.once('pointerdown', () => this.scene.restart(restart));
    });
  }

  // ---------- Cenário ----------

  /** Placas de espinhos de metal; tocar nelas tira um coração. */
  private drawSpikes() {
    const g = this.add.graphics().setDepth(-50);
    for (const [col, row] of SPIKES) {
      const x = FLOOR.x + col * TILE;
      const y = FLOOR.y + row * TILE;
      g.fillStyle(0x000000, 0.25).fillRoundedRect(x + 4, y + 6, TILE - 6, TILE - 6, 6);
      g.fillStyle(0x3b3532).fillRoundedRect(x + 4, y + 4, TILE - 8, TILE - 8, 6);
      g.lineStyle(2, 0x171312).strokeRoundedRect(x + 4, y + 4, TILE - 8, TILE - 8, 6);
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          const sx = x + 16 + i * 16;
          const sy = y + 22 + j * 16;
          g.fillStyle(0x000000, 0.35).fillEllipse(sx, sy + 2, 12, 5);
          g.fillStyle(0x8f8984).fillTriangle(sx - 5, sy, sx + 5, sy, sx, sy - 14);
          g.fillStyle(0xd8d2cc).fillTriangle(sx - 2, sy - 1, sx, sy - 1, sx, sy - 12);
          g.lineStyle(1.5, 0x1d1917).strokeTriangle(sx - 5, sy, sx + 5, sy, sx, sy - 14);
        }
      }
      this.spikeRects.push(new Phaser.Geom.Rectangle(x + 10, y + 10, TILE - 20, TILE - 20));
    }
  }
}
