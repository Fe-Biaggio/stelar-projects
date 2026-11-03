import Phaser from 'phaser';
import { FLOOR, GAME_HEIGHT, GAME_WIDTH, ROOM_COLS, ROOM_ROWS, TILE, WALL } from '../config';
import { CatId, PLAYABLE } from '../cats';
import { ITEMS, ItemId, ItemInfo, applyItem, randomItemOf } from '../items';
import { SfxName, playSfx, sfx } from '../audio/sfx';
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
import { HEART_POINTS, PickupKind, addPickup, isHeart, useKey } from '../pickups';
import { RARITY_INFO, RARITY_ORDER, rarityOdds, rollRarity } from '../rarity';
import { GameMode, MAX_LEVEL, PlayerState, RoomId, RoomState, Run, newRun, startNextLevel, vsPoints } from '../run';
import { STAT_LABELS, Stats, formatMult } from '../stats';
import { BTN, PadInput } from '../ui/Gamepad';
import { Hud, markOwner } from '../ui/Hud';
import { MapView } from '../ui/MapView';
import { TouchControls, isTouchDevice } from '../ui/TouchControls';
import { drawScorch, playExplosion } from '../world/explosion';
import { priceOf, rollShopItems } from '../shop';
import { RoomDef, doorKey, neighbors } from '../world/floor';
import { BotView } from './bot';
import { DOOR_POS, DoorSide, drawBossDoorMark, drawDoorBars, drawDoorCracks, drawLockedDoor, drawRoom, drawTrapdoor } from '../world/room';
import { net } from '../net/peer';
import { ViewerMeta, session } from '../net/session';
import { returnToLobby, vs } from './vsDirector';
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

void blocksWalk;

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
// Salas de teste à direita do baú (modo desenvolvedor): todos os itens, em duas páginas.
const DEV_ITEM_PAGES: ItemId[][] = [
  ['can', 'catnip', 'brush', 'churu', 'yarn', 'fish', 'milk', 'vampire'],
  ['collar', 'paw', 'pepper', 'ice', 'pinwheel', 'stone', 'slingshot'],
];

/** Posição de cada item na sala de teste: metade na linha de cima, metade na de baixo. */
function devItemSpots(n: number) {
  const top = Math.ceil(n / 2);
  return Array.from({ length: n }, (_, i) => {
    const row = i < top ? 1 : 5;
    const k = i < top ? i : i - top;
    const count = i < top ? top : n - top;
    const col = Math.round(1 + ((k + 0.5) * 11) / count);
    return tileCenter(col, row);
  });
}

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

export interface RoomData {
  cat?: CatId;
  mode?: GameMode;
  run?: Run;
  room?: RoomId;
  /** Porta por onde o gato entrou. */
  enterFrom?: DoorSide;
  /** Acabou de descer para um nível novo (mostra "Nível N"). */
  newLevel?: boolean;
}

/** Um gato dentro da sala (no multiplayer há vários; os remotos são comandados pela rede). */
export interface Slot {
  ps: PlayerState;
  player?: Player;
  local: boolean;
  /** 0 = chão, 1 = em cima da cadeira, 2 = em cima da mesa. */
  height: number;
  move: Phaser.Math.Vector2;
  aim: Facing | null;
  /** Direção travada enquanto o botão de atirar (A) está seguro. */
  fireDir: Facing | null;
  hud: Hud;
  map?: MapView;
  colliders: Phaser.Physics.Arcade.Collider[];
  /** Tela de "você foi eliminado" (VS). */
  outShown?: boolean;
  /** Nome do jogador embaixo do gato (VS). */
  nameTag?: Phaser.GameObjects.Text;
}

function weightedPick<T>(list: [T, number][]): T {
  let r = Math.random() * list.reduce((sum, [, w]) => sum + w, 0);
  for (const [v, w] of list) {
    if ((r -= w) < 0) return v;
  }
  return list[list.length - 1][0];
}

/** Sorteio com "mais drops": a chance de vir algo é multiplicada por `mult` (até 100%). */
function rollDrop<T>(list: [T | 'none', number][], mult: number): T | 'none' {
  if (mult === 1) return weightedPick(list);
  const total = list.reduce((s, [, w]) => s + w, 0);
  const some = list.filter(([v]) => v !== 'none') as [T, number][];
  const pSome = Math.min(1, (some.reduce((s, [, w]) => s + w, 0) / total) * mult);
  return Math.random() < pSome ? weightedPick(some) : 'none';
}

export class RoomScene extends Phaser.Scene {
  run!: Run;
  roomId: RoomId = '0,0';
  /** Definição da sala (guardada: no VS a sala pode ser destruída enquanto a cena fecha). */
  def!: RoomDef;
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
  /** Inimigos que já soltaram o que tinham ao morrer. */
  private dropped = new Set<Enemy>();
  /** O jogo acabou (vitória ou fim): a sala para, mas os botões de recomeçar continuam. */
  private finished = false;
  private bossBar?: { fill: Phaser.GameObjects.Rectangle; boss: Enemy; parts: Phaser.GameObjects.GameObject[] };
  readonly slots: Slot[] = [];
  private dummy?: DummyCat;
  private chest?: Chest;
  private moveKeys!: MoveKeys;
  private aimKeys!: AimKeys;
  private furballs: Furball[] = [];
  private spikeRects: Phaser.Geom.Rectangle[] = [];
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
  /** Portas que levam a salas destruídas (VS): ficam gradeadas. */
  private sealed = new Set<DoorSide>();
  /** Evita repetir o aviso de "precisa de chave/moedas" a cada quadro. */
  private nagUntil = 0;
  /** Depois de destrancar, espera um pouco antes de deixar passar pela porta. */
  private doorPauseUntil = 0;
  private statTexts = new Map<string, Phaser.GameObjects.Text>();
  private banner?: Phaser.GameObjects.Container;
  private hint?: Phaser.GameObjects.Text;
  private leaving = false;
  /** VS: tempo, lista de gatos vivos e aviso de sala condenada. */
  private vsTimer?: Phaser.GameObjects.Text;
  private aliveList: Phaser.GameObjects.GameObject[] = [];
  private doomText?: Phaser.GameObjects.Text;
  /** VS: esta sala foi destruída (a cena fecha em seguida). */
  doomed = false;

  constructor(key = 'Room') {
    super(key);
  }

  private get roomState(): RoomState {
    return (this.run.rooms[this.roomId] ??= { items: [], pickups: [] });
  }

  private get roomDef(): RoomDef {
    return this.def;
  }

  private get isDev() {
    return this.run.mode === 'dev';
  }

  private get isVs() {
    return this.run.mode === 'vs';
  }

  private get isMulti() {
    return this.run.mode === 'coop' || this.run.mode === 'vs';
  }

  private get hs() {
    return session.host;
  }

  /** Gato deste aparelho, se estiver nesta sala. */
  private get localSlot() {
    return this.slots.find((s) => s.local);
  }

  /** Primeiro gato (o modo dev e alguns sorteios usam ele). */
  private get mainPs() {
    return this.run.players[0];
  }

  /** Sorte usada nos sorteios da sala: a maior entre os gatos. */
  private get luck() {
    return Math.max(...this.run.players.map((p) => p.stats.luck));
  }

  private get alivePlayers() {
    return this.slots.filter((s) => s.player && !s.player.dead);
  }

  /** Salas vizinhas desta sala, por lado da porta. */
  private get doors() {
    return neighbors(this.run.floor, this.roomId);
  }

  private get level() {
    return this.isVs ? (this.def.bossLevel ?? 1) : this.run.level;
  }

  /** Multiplicador de dano dos inimigos: 1x no nível 1, +0,5x a cada nível (1; 1,5; 2; ...). */
  private get enemyDamageMult() {
    return 1 + ENEMY_DAMAGE_PER_LEVEL * (this.level - 1);
  }

  /**
   * Dano dos inimigos em pontos inteiros (meios corações), arredondado para baixo:
   * 1,5x tira meio coração; 2x tira um coração; 2,5x também tira um coração.
   */
  private get enemyDamage() {
    return Math.max(1, Math.floor(ENEMY_DAMAGE * this.enemyDamageMult));
  }

  /** Co-op com itens individuais: 1,5x mais drops. */
  private get dropMult() {
    return this.run.mode === 'coop' && !this.run.sharedItems ? 1.5 : 1;
  }

  /** Ainda há inimigos vivos (as portas ficam fechadas). */
  private get inCombat() {
    return this.enemies.some((e) => !e.dead);
  }

  /** Sem `run`, começa uma partida nova (vinda da seleção ou do R). */
  init(data: RoomData) {
    this.run = data.run ?? newRun(data.cat ?? 'black', data.mode ?? 'dev');
    this.roomId = data.room && this.run.floor.rooms[data.room] ? data.room : this.run.floor.startId;
    this.def = this.run.floor.rooms[this.roomId];
    this.enterFrom = data.enterFrom;
    this.newLevel = !!data.newLevel;
  }

  create() {
    this.leaving = false;
    this.finished = false;
    this.doomed = false;
    this.propObjs = [];
    this.dropped.clear();
    this.furballs = [];
    this.spikeRects = [];
    this.items = [];
    this.pickups = [];
    this.slots.length = 0;
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
    this.sealed.clear();
    this.statTexts.clear();
    this.aliveList = [];
    this.vsTimer = undefined;
    this.doomText = undefined;
    this.touch = undefined;
    this.nagUntil = 0;
    this.doorPauseUntil = 0;
    for (const p of this.run.players) createFurballTexture(this, p.cat);
    this._doorsAtStart = new Set(Object.keys(this.doors) as DoorSide[]);
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
      const id = randomItemOf(rollRarity(this.luck));
      this.roomState.items.push({ id, x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 + 30 });
    } else if (this.roomDef.npc) {
      // Gatinho pedinte ou vampiro (sala sem inimigos)
      const state = (this.roomState.npc ??= { given: 0, gone: false });
      if (!state.gone) this.npc = new Npc(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, this.roomDef.npc);
      if (type === 'devNpc' && (firstVisit || this.devBombsOnRestart)) this.addDevNpcSupplies();
    } else if (type === 'boss' && this.roomState.cleared && !this.isVs) {
      this.placeTrapdoor(false);
    } else if (type === 'shop') {
      // O vendedor é um gato diferente dos que estão jogando
      const vendorCat = PLAYABLE.find((c) => c !== 'black' && !this.run.players.some((p) => p.cat === c)) ?? 'orange';
      this.vendor = new Vendor(this, GAME_WIDTH / 2, FLOOR.y + 120, vendorCat);
      if (firstVisit) this.stockShop();
    }
    // Itens que ficaram no chão da última vez que alguém esteve aqui
    for (const it of this.roomState.items) {
      this.items.push(new ItemPickup(this, it.x, it.y, it.id, { kind: 'none' }, it.price));
    }
    for (const p of this.roomState.pickups) this.pickups.push(new Pickup(this, p.x, p.y, p.kind, false, p.tag));
    if (firstVisit && (type === 'devStart' || type === 'devActives' || type === 'devItems')) this.respawnItems(false);
    if (type === 'devItems') this.labelDevItems();
    if ((firstVisit || this.devBombsOnRestart) && type === 'devProps') this.addDevBombs();
    this.devBombsOnRestart = false;

    // Controles do teclado (só valem para o gato deste aparelho)
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.moveKeys = kb.addKeys({ w: K.W, a: K.A, s: K.S, d: K.D }) as MoveKeys;
    this.aimKeys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT }) as AimKeys;
    kb.addCapture([K.UP, K.DOWN, K.LEFT, K.RIGHT, K.SPACE]);
    kb.on('keydown-ESC', () => this.isViewedHere && this.backToSelect());
    kb.on('keydown-E', () => this.localSlot && this.placeBomb(this.localSlot));
    kb.on('keydown-SPACE', () => this.localSlot && this.useActive(this.localSlot));
    kb.on('keydown-Q', () => this.localSlot && this.useActive(this.localSlot));
    kb.on('keydown-M', () => this.localSlot?.map?.toggle());
    kb.on('keydown-TAB', () => this.localSlot?.map?.toggle());

    // Sons: toca aqui (se esta sala está na tela) e manda para quem está olhando de longe
    this.events.on('sfx', (name: SfxName) => {
      if (this.isViewedHere) playSfx(name);
      this.hs?.sfx(this, name);
    });
    this.cameras.main.on(Phaser.Cameras.Scene2D.Events.SHAKE_START, (_c: unknown, _e: unknown, d: number, i: number) =>
      this.hs?.shake(this, d, i),
    );

    // Os gatos
    if (this.isVs) {
      for (const e of vs.director?.takePending(this.roomId) ?? []) this.addSlot(e.ps, e.enterFrom, e.bigMap);
    } else {
      const spawnable = this.run.players.filter((p) => !this.hs?.gone.has(p.idx));
      spawnable.forEach((ps) => this.addSlot(ps, this.enterFrom));
    }

    // Salas com inimigos: fecha as portas até limpar
    const peaceful = !!this.roomDef.npc || type === 'start'; // gatinho, loja e início não têm inimigos
    const first = this.slots[0]?.player;
    const from = first ? first.feet : { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
    if ((type === 'normal' || type === 'boss' || type === 'devProps') && !this.roomState.cleared && !peaceful) this.spawnEnemies(from);

    this.createTopButtons();
    if (this.isDev) this.createStatsPanel();
    if (this.isVs) this.createVsHud();

    if (this.newLevel) {
      const mult = this.enemyDamageMult.toFixed(1).replace('.', ',');
      this.time.delayedCall(250, () => {
        this.showBanner(`Nível ${this.run.level} de ${MAX_LEVEL}`, `Mais inimigos · dano deles ${mult}x`, '#f2c879');
        sfx(this, 'level');
      });
    }
    if (!this.enterFrom && !this.newLevel && !this.isMulti) {
      this.hint = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - WALL - 28, this.touch ? 'Esquerda: andar  ·  direita: atirar e bomba' : 'WASD andar  ·  setas atirar  ·  E bomba  ·  M mapa', {
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
    if (this.enterFrom && !this.isVs) this.cameras.main.fadeIn(180);

    // Quem está longe passa a ver esta sala
    if (this.hs && !this.isVs) for (const s of this.slots) if (!s.local) this.hs.viewing.set(s.ps.idx, this);
    if (this.isVs) vs.director?.sceneReady(this);
    if (this.hs && !this.isVs) {
      // Jogador remoto que sai da partida no meio: o gato dele cai
      const onLeft = (idx: number) => {
        const slot = this.slots.find((s) => s.ps.idx === idx);
        slot?.player?.kill();
      };
      this.hs.events.on('left', onLeft);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hs?.events.off('left', onLeft));
    }
  }

  /** Esta sala está na tela deste aparelho? (no VS várias salas rodam ao mesmo tempo) */
  get isViewedHere() {
    return !this.isVs || vs.director?.localScene === this;
  }

  // ---------- Gatos na sala ----------

  /** Coloca um gato na sala (entrando pela porta `enterFrom`, ou no começo). */
  addSlot(ps: PlayerState, enterFrom?: DoorSide, bigMap = false) {
    const local = !this.hs || ps.idx === net.myIdx;
    if (local && !this.touch && isTouchDevice(this)) {
      this.touch = new TouchControls(
        this,
        () => this.localSlot && this.placeBomb(this.localSlot),
        () => this.localSlot && this.useActive(this.localSlot),
      );
      this.touch.markLocal();
    }
    const slot: Slot = {
      ps,
      local,
      height: 0,
      move: new Phaser.Math.Vector2(),
      aim: null,
      fireDir: null,
      hud: undefined as unknown as Hud,
      colliders: [],
    };
    this.slots.push(slot);
    if (ps.alive) {
      const order = this.slots.filter((s) => s.player).length;
      slot.player = this.makePlayer(slot, this.spawnPoint(enterFrom, order));
    }
    slot.hud = new Hud(this, ps, () => slot.player, local, local ? this.touch : undefined);
    if (!this.isDev) {
      slot.map = new MapView(this, this.run, ps, () => this.roomId, local, () => slot.map?.toggle());
      if (bigMap) slot.map.setBig(true);
    }
    if (this.isVs) {
      ps.room = this.roomId;
      ps.seen ??= [];
      if (!ps.seen.includes(this.roomId)) ps.seen.push(this.roomId);
      slot.map?.draw();
    }
    return slot;
  }

  /** Tira o gato da sala (VS: ele foi para outra sala). Guarda a vida e o item dele. */
  removeSlot(slot: Slot) {
    this.saveSlot(slot);
    for (const c of slot.colliders) c.destroy();
    slot.player?.destroy();
    slot.player = undefined;
    slot.nameTag?.destroy();
    slot.nameTag = undefined;
    const i = this.slots.indexOf(slot);
    if (i >= 0) this.slots.splice(i, 1);
    // HUD e mapa dele: some daqui
    const owned = (o: Phaser.GameObjects.GameObject) => (o as unknown as { __owner?: number }).__owner === slot.ps.idx;
    for (const o of [...this.children.list]) if (owned(o)) o.destroy();
    if (slot.local && this.touch) {
      this.touch.destroy();
      this.touch = undefined;
    }
  }

  private makePlayer(slot: Slot, spawn: { x: number; y: number; facing: Facing }) {
    const ps = slot.ps;
    const player = new Player(this, spawn.x, spawn.y, ps.cat, ps.stats, ps.hp, ps.shield, spawn.facing);
    const col = (c: Phaser.Physics.Arcade.Collider) => slot.colliders.push(c);
    if (this.dummy) col(this.physics.add.collider(player.body, this.dummy.body));
    if (this.chest) col(this.physics.add.collider(player.body, this.chest.body, () => this.tryOpenChest(slot)));
    if (this.vendor) col(this.physics.add.collider(player.body, this.vendor.body));
    if (this.npc) col(this.physics.add.collider(player.body, this.npc.body, () => this.touchNpc(slot)));
    for (const bomb of this.bombs) {
      const c = this.physics.add.collider(player.body, bomb.body, undefined, () => bomb.solid);
      bomb.colliders.push(c);
      col(c);
    }
    this.addPropColliders(slot, player);
    player.on('hp', () => slot.hud?.updateHearts(true));
    player.on('hurt', () => sfx(this, 'hurt'));
    player.on('stats', (stats: Stats) => slot.local && this.updateStats(stats));
    player.loadActive(ps.active);
    player.on('active', () => slot.hud?.updateActiveHud(true));
    player.on('dead', () => this.onPlayerDead(slot));
    if (this.isVs) {
      slot.nameTag?.destroy();
      slot.nameTag = this.add
        .text(spawn.x, spawn.y, ps.name, { fontFamily: 'monospace', fontSize: '12px', color: slot.local ? '#f2c879' : '#e8d9c4', stroke: '#0c0907', strokeThickness: 3 })
        .setOrigin(0.5, 0);
    }
    return player;
  }

  /** Onde o gato aparece: na porta por onde entrou, ou embaixo do centro no começo. */
  private spawnPoint(enterFrom: DoorSide | undefined, order = 0): { x: number; y: number; facing: Facing } {
    const cy = GAME_HEIGHT / 2 + 10;
    // Vários gatos entrando juntos ficam lado a lado
    const off = order === 0 ? 0 : (order % 2 ? 1 : -1) * Math.ceil(order / 2) * 46;
    switch (enterFrom) {
      case 'left':
        return { x: FLOOR.x + 36, y: cy + off, facing: 'right' };
      case 'right':
        return { x: FLOOR.x + FLOOR.width - 36, y: cy + off, facing: 'left' };
      case 'up':
        return { x: GAME_WIDTH / 2 + off, y: FLOOR.y + 40, facing: 'down' };
      case 'down':
        return { x: GAME_WIDTH / 2 + off, y: FLOOR.y + FLOOR.height - 20, facing: 'up' };
      default:
        return { x: GAME_WIDTH / 2 + off, y: GAME_HEIGHT / 2 + TILE * 2.5, facing: 'down' };
    }
  }

  /** Um gato caiu. Solo: fim de jogo. Co-op: volta quando o outro limpar uma sala. VS: eliminado. */
  private onPlayerDead(slot: Slot) {
    sfx(this, 'die');
    slot.ps.alive = false;
    slot.ps.hp = 0;
    slot.ps.shield = 0;
    if (this.isVs) {
      vs.director?.onDeath(slot.ps.idx);
      this.showEliminated(slot);
      return;
    }
    if (this.run.mode === 'coop') {
      if (this.run.players.every((p) => !p.alive)) {
        this.showGameOver();
        return;
      }
      this.showBanner(`${slot.ps.name} caiu!`, 'Limpe uma sala para trazer de volta', '#c8c0b8');
      return;
    }
    this.showGameOver();
  }

  /** Co-op: quem caiu volta com meio coração quando o outro limpa uma sala. */
  private reviveFallen() {
    if (this.run.mode !== 'coop') return;
    for (const slot of this.slots) {
      if (slot.ps.alive || this.hs?.gone.has(slot.ps.idx)) continue;
      slot.ps.alive = true;
      slot.ps.hp = 1;
      slot.ps.shield = 0;
      const old = slot.player;
      const x = old ? old.feet.x : GAME_WIDTH / 2;
      const y = old ? old.feet.y : GAME_HEIGHT / 2 + 40;
      for (const c of slot.colliders) c.destroy();
      slot.colliders = [];
      old?.destroy();
      slot.player = this.makePlayer(slot, { x, y, facing: 'down' });
      slot.hud.updateHearts(true);
      this.showBanner(`${slot.ps.name} voltou!`, 'Com meio coração', '#f2c879');
      sfx(this, 'power');
    }
  }

  // ---------- Comandos ----------

  /** Lê teclado, controle e toque para o gato deste aparelho. */
  private readLocalInput() {
    const slot = this.localSlot;
    if (!slot) return;
    const move = slot.move;
    const k = this.moveKeys;
    move.set((k.d.isDown ? 1 : 0) - (k.a.isDown ? 1 : 0), (k.s.isDown ? 1 : 0) - (k.w.isDown ? 1 : 0));
    // Controle físico: analógico/direcional anda, analógico direito mira; A atira, B bomba, X item, Y mapa
    this.pad.poll();
    if (this.pad.used && this.touch) this.touch.hide();
    const padMove = this.pad.move;
    if (padMove.x || padMove.y) move.set(padMove.x, padMove.y);
    if (this.pad.bombPressed) this.placeBomb(slot);
    if (this.pad.itemPressed) this.useActive(slot);
    if (this.pad.mapPressed) slot.map?.toggle();
    if (this.pad.pressed(BTN.START)) this.backToSelect();
    if (this.touch && this.touch.move.lengthSq() > 0) move.copy(this.touch.move);
    const aim = this.currentAim() ?? this.pad.aim ?? this.touch?.aim ?? null;
    slot.aim = this.resolveFire(slot, aim, this.pad.fireHeld);
  }

  /** Comandos que chegaram pela rede para os outros gatos (e o que os bots decidiram). */
  private readRemoteInputs(dt: number) {
    const hs = this.hs;
    if (!hs) return;
    for (const slot of this.slots) {
      const brain = hs.bots.get(slot.ps.idx);
      if (brain && slot.player && !slot.player.dead) hs.inputs.set(slot.ps.idx, brain.think(this.botView(slot), dt));
    }
    for (const slot of this.slots) {
      if (slot.local) continue;
      const inp = hs.input(slot.ps.idx);
      if (!inp) continue;
      slot.move.set(inp.mx, inp.my);
      const acts = hs.takeActions(slot.ps.idx);
      if (acts.bomb) this.placeBomb(slot);
      if (acts.item) this.useActive(slot);
      if (acts.map) slot.map?.toggle();
      slot.aim = this.resolveFire(slot, inp.aim, inp.fire);
    }
  }

  /** O que o bot enxerga: alvos, parceiro e portas abertas. */
  private botView(slot: Slot): BotView {
    const me = slot.player!.body.center;
    const targets: { x: number; y: number }[] = this.enemies.filter((e) => !e.dead).map((e) => ({ x: e.x, y: e.y }));
    if (this.isVs) {
      for (const s of this.alivePlayers) if (s !== slot) targets.push({ x: s.player!.body.center.x, y: s.player!.body.center.y });
    }
    const friendSlot = this.alivePlayers.find((s) => s !== slot && !this.hs?.bots.has(s.ps.idx)) ?? this.alivePlayers.find((s) => s !== slot);
    const friend = friendSlot ? { x: friendSlot.player!.body.center.x, y: friendSlot.player!.body.center.y } : undefined;
    const doors: BotView['doors'] = [];
    if (!this.inCombat) {
      const board = this.run.vs;
      const next = board?.stages[board.stage + 1];
      for (const [side, id] of Object.entries(this.doors) as [DoorSide, RoomId][]) {
        if (this.isLocked(side)) continue;
        const def = this.run.floor.rooms[id];
        let score = Math.random();
        if (board) {
          // Rumo ao centro, e nunca para uma sala que vai sumir
          score -= Math.abs(def.gx - board.center[0]) + Math.abs(def.gy - board.center[1]);
          if (next && vs.director?.isDoomedSoon(def)) score -= 100;
        }
        doors.push({ side, score });
      }
    }
    return { me: { x: me.x, y: me.y }, targets, friend, doors, vs: this.isVs, combat: this.inCombat };
  }

  /** Mira pelas setas/analógico; sem mira, o botão de atirar usa a direção para onde o gato olha. */
  private resolveFire(slot: Slot, aim: Facing | null, fireHeld: boolean): Facing | null {
    if (aim) {
      slot.fireDir = null;
      return aim;
    }
    if (!fireHeld) {
      slot.fireDir = null;
      return null;
    }
    slot.fireDir ??= slot.player?.facingDir ?? 'down';
    return slot.fireDir;
  }

  update(time: number, deltaMs: number) {
    if (this.leaving || this.finished) {
      if (this.finished) this.checkRemoteRestart();
      this.hs?.pump(this);
      return;
    }
    // Limita o passo para a física não dar saltos se a aba ficar em segundo plano.
    const dt = Math.min(deltaMs, 50) / 1000;

    this.readLocalInput();
    this.readRemoteInputs(dt);

    if (this.hint) {
      const s = this.localSlot;
      if (s && (s.move.lengthSq() > 0 || s.aim)) {
        const hint = this.hint;
        this.hint = undefined;
        this.tweens.add({ targets: hint, alpha: 0, duration: 800, delay: 2000, onComplete: () => hint.destroy() });
      }
    }

    for (const slot of this.slots) {
      const player = slot.player;
      if (!player) continue;
      this.updateElevation(slot);
      const shot = player.update(slot.move, slot.aim, dt, time);
      if (slot.nameTag) {
        const feet = player.feet;
        slot.nameTag.setPosition(feet.x, feet.y + 8).setDepth(feet.y + 1).setAlpha(player.dead ? 0.4 : 1);
      }
      if (shot) {
        const f = new Furball(this, slot.ps.cat, shot.x, shot.y, shot.dir, shot.height, shot.inherited, shot.stats);
        f.owner = slot.ps.idx;
        this.furballs.push(f);
        sfx(this, 'shoot');
      }
    }

    for (const f of this.furballs) {
      f.update(dt);
      const { x, y } = f.position;
      if (this.dummy && !f.dead && this.dummy.hits(x, y, f.hitRadius)) {
        const d = f.direction;
        f.burst();
        this.dummy.takeHit(d.x, d.y, f.damage);
        sfx(this, 'hit');
        if (this.showDamage) this.showDamageNumber(this.dummy.x, this.dummy.y - 70, f.damage);
      }
      // Pedras e fogueiras seguram a bola de pelo; bola molhada ou congelada apaga a fogueira
      if (!f.dead && this.rockAt(x, y)) f.burst();
      if (!f.dead) {
        const fire = this.fireAt(x, y);
        if (fire) {
          f.burst();
          if (f.elements.includes('water') || f.elements.includes('ice')) this.putOut(fire);
          else if (!f.elements.includes('fire')) this.hitFire(fire);
        }
      }
      for (const e of this.enemies) {
        if (f.dead || !e.hits(x, y, f.hitRadius)) continue;
        const d = f.direction;
        f.burst();
        e.lastHitBy = f.owner;
        e.takeHit(d.x, d.y, f.damage, f.elements);
        sfx(this, 'hit');
        if (this.showDamage) this.showDamageNumber(e.x, e.y - 50, f.damage);
      }
      // VS: a bola de pelo acerta os outros gatos
      if (this.isVs && !f.dead) {
        for (const s of this.slots) {
          const p = s.player;
          if (!p || p.dead || s.ps.idx === f.owner) continue;
          if (Phaser.Math.Distance.Between(x, y, p.feet.x, p.feet.y - 18) > 26 + f.hitRadius) continue;
          f.burst();
          p.takeDamage(Math.max(1, Math.floor(f.damage)), x, y);
          break;
        }
      }
    }
    this.dummy?.update(time);
    this.vendor?.update(time);
    this.npc?.update(time);
    this.updateEnemies(dt, time);
    this.furballs = this.furballs.filter((f) => !f.dead);

    for (const slot of this.slots) this.checkSpikes(slot);
    this.updateFires(time);
    this.checkItems(time);
    this.checkPickups(time);
    this.updateBombs(dt, time);
    for (const slot of this.slots) {
      const p = slot.player;
      if (p?.active && p.activeCharge < 1) slot.hud.updateActiveHud(false);
      slot.map?.tick(dt);
    }
    this.checkTrapdoor();
    for (const slot of [...this.slots]) this.checkDoors(slot);
    if (this.isVs) this.updateVsHud();
    this.hs?.pump(this);
  }

  /** O que a tela remota de um jogador precisa (item usável e onde fica o mapa). */
  viewerMeta(idx: number): ViewerMeta | null {
    const slot = this.slots.find((s) => s.ps.idx === idx);
    const p = slot?.player;
    const b = slot?.map?.bounds;
    return {
      a: [p?.active ? p.active.frame : -1, (p?.activeCharge ?? 0) >= 1],
      mb: b ? [b.x, b.y, b.width, b.height] : [0, 0, 0, 0],
      alive: !!p && !p.dead,
    };
  }

  // ---------- Inimigos ----------

  /** Coloca os inimigos longe de onde o gato entrou e fecha as portas. */
  private spawnEnemies(from: { x: number; y: number }) {
    const level = this.level;
    if (this.roomDef.type === 'boss') {
      const bossType = BOSS_BY_LEVEL[Math.min(level, BOSS_BY_LEVEL.length) - 1];
      const boss = new Enemy(this, GAME_WIDTH / 2, FLOOR.y + 150, 'boss', level, bossType);
      this.enemies.push(boss);
      this.createBossBar(boss);
      this.time.delayedCall(300, () => sfx(this, 'boss'));
    } else {
      // 2 a 4 inimigos no nível 1, e mais um a cada nível (até 8). No co-op, o dobro.
      const coop = this.run.mode === 'coop' ? 2 : 1;
      const kinds: EnemyKind[] =
        this.roomDef.type === 'devProps'
          ? ['fly', 'pale'] // teste: um que voa (alcança a mesa) e um de chão (não alcança)
          : Array.from({ length: Math.min((2 + Math.floor(Math.random() * 3) + (level - 1)) * coop, 8 * coop) }, () =>
              weightedPick(ENEMY_POOL),
            );
      const count = kinds.length;
      const placed: { x: number; y: number }[] = [];
      for (let i = 0; i < count; i++) {
        let x = 0;
        let y = 0;
        for (let tries = 0; tries < 40; tries++) {
          x = Phaser.Math.Between(FLOOR.x + 70, FLOOR.x + FLOOR.width - 70);
          y = Phaser.Math.Between(FLOOR.y + 70, FLOOR.y + FLOOR.height - 50);
          const farFromCat = Phaser.Math.Distance.Between(x, y, from.x, from.y) > 260;
          const apart = placed.every((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) > (coop > 1 ? 60 : 80));
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
    const alive = this.alivePlayers;
    const nearest = (x: number, y: number) => {
      let best = alive[0]?.player?.feet ?? { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
      let bd = Infinity;
      for (const s of alive) {
        const f = s.player!.feet;
        const d = Phaser.Math.Distance.Between(x, y, f.x, f.y);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      return best;
    };
    const shoot = (x: number, y: number, vx: number, vy: number, flying: boolean) =>
      this.enemyShots.push(new EnemyShot(this, x, y, vx, vy, flying));
    for (const e of this.enemies) {
      e.update(dt, time, { target: nearest(e.x, e.y), shoot });
      // Encostar em qualquer inimigo (boss incluído) tira 1 de vida: meio coração
      // Em cima da mesa, só quem voa alcança o gato
      if (e.dead || e.spawning) continue;
      for (const s of alive) {
        const p = s.player!;
        if (p.dead || !(s.height < 2 || e.flies)) continue;
        const feet = p.feet;
        if (Phaser.Math.Distance.Between(feet.x, feet.y - 8, e.x, e.body.center.y) < e.radius + 14) {
          p.takeDamage(this.enemyDamage, e.x, e.y);
        }
      }
    }
    for (const shot of this.enemyShots) {
      shot.update(dt);
      for (const s of alive) {
        const p = s.player!;
        if (shot.dead || p.dead || !(s.height < 2 || shot.fromFlyer)) continue;
        const feet = p.feet;
        if (Phaser.Math.Distance.Between(shot.x, shot.y, feet.x, feet.y) < 20) {
          shot.burst();
          p.takeDamage(this.enemyDamage, shot.x, shot.y);
        }
      }
    }
    this.enemyShots = this.enemyShots.filter((s) => !s.dead);
    if (this.bossBar) {
      const { boss, fill } = this.bossBar;
      fill.width = (396 * Math.max(boss.hp, 0)) / boss.maxHp;
    }

    for (const e of this.enemies) {
      if (e.dead && !this.dropped.has(e)) {
        this.dropped.add(e);
        sfx(this, 'enemyDie');
        const killer = this.run.players[e.lastHitBy];
        if (killer) {
          killer.score ??= { kills: 0, items: 0, bosses: 0 };
          if (e.kind === 'boss') killer.score.bosses++;
          else killer.score.kills++;
        }
        if (e.kind !== 'boss') this.enemyDrop(e.x, e.y);
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
    sfx(this, 'door');
    this.reviveFallen();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 + 30;
    if (this.roomDef.type === 'boss') {
      this.bossName = this.bossBar?.boss.name ?? 'Boss';
      this.bossBar?.parts.forEach((p) => p.destroy());
      this.bossBar = undefined;
      if (!this.isVs && this.run.level >= MAX_LEVEL) {
        // Último nível: fim de jogo com vitória
        this.time.delayedCall(1200, () => this.showVictory());
        return;
      }
      if (this.isVs) this.showBanner(`${this.bossName} derrotado!`, 'Pegue o prêmio', '#f2c879');
      else {
        this.showBanner(`${this.bossName} derrotado!`, 'Desça pelo alçapão para o próximo nível', '#f2c879');
        this.placeTrapdoor(true);
      }
      // Prêmio do boss: um item (a sorte ajuda) e um coração
      const id = randomItemOf(rollRarity(this.luck));
      this.items.push(new ItemPickup(this, cx - 110, cy + 40, id, { kind: 'toss', fromX: cx, fromY: FLOOR.y + 120 }));
      this.pickups.push(new Pickup(this, cx + 110, cy + 40, 'heart', true));
      return;
    }
    const drop = rollDrop(CLEAR_DROPS, this.dropMult);
    if (drop !== 'none') {
      const spot = this.freeDropSpot(cx, cy + (this.chest ? 70 : 0));
      this.pickups.push(new Pickup(this, spot.x, spot.y, drop, true));
    }
  }

  /** Sorteio do que um inimigo solta ao morrer: moeda 50%, chave/bomba 10%, item 5%. */
  private enemyDrop(x: number, y: number) {
    const drop = rollDrop(ENEMY_DROPS, this.dropMult);
    if (drop === 'none') return;
    const spot = this.freeFloorSpot(x, y);
    if (drop === 'item') {
      const id = randomItemOf(rollRarity(this.luck));
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
    const tex = this.propTexture(prop);
    const lift = prop.kind === 'table' ? 14 : prop.kind === 'chair' ? 8 : prop.kind === 'fire' ? 10 : 4;
    const sprite = this.add.image(cx, bottom + lift, tex).setOrigin(0.5, 1).setDepth(bottom);
    if (prop.broken) sprite.setDepth(-57); // destroços ficam no chão
    else if (prop.kind === 'fire') sprite.setScale(this.fireScale(prop));
    const body =
      prop.kind === 'table'
        ? this.physics.add.staticBody(r.x + 4, r.y + 8, r.w - 8, r.h - 12)
        : this.physics.add.staticBody(r.x + 8, r.y + 12, r.w - 16, r.h - 18);
    return { prop, body, sprite };
  }

  /** Desenho de cada elemento (inteiro ou destruído). */
  private propTexture(p: Prop) {
    if (p.kind === 'rock') return p.broken ? 'rubble' : 'rock';
    if (p.kind === 'fire') return p.broken ? 'campfire_out' : 'campfire';
    return p.broken ? `${p.kind}_broken` : p.kind;
  }

  /** Fogueiras: as chamas mexem, e encostar queima (meio coração). */
  private updateFires(time: number) {
    const frame = Math.floor(time / 120) % 3;
    for (const o of this.propObjs) {
      if (o.prop.kind !== 'fire' || o.prop.broken) continue;
      o.sprite?.setFrame(frame);
      const r = propRect(o.prop);
      for (const s of this.slots) {
        const p = s.player;
        if (!p || p.dead) continue;
        const b = p.body;
        // Encostar = chegar a 4 px do corpo da fogueira (que bloqueia a passagem)
        const touching = b.right > r.x + 4 && b.left < r.x + r.w - 4 && b.bottom > r.y + 8 && b.top < r.y + r.h - 2;
        if (touching) p.takeDamage(1, r.x + r.w / 2, r.y + r.h / 2);
      }
    }
  }

  /** Tamanho da chama: diminui a cada acerto de bola de pelo comum. */
  private fireScale(p: Prop) {
    return 1 - (p.hits ?? 0) * 0.22;
  }

  /** Bola de pelo comum: a fogueira diminui e apaga no 3º acerto. */
  private hitFire(o: PropObj) {
    o.prop.hits = (o.prop.hits ?? 0) + 1;
    if (o.prop.hits >= 3) {
      this.putOut(o);
      return;
    }
    if (o.sprite) this.tweens.add({ targets: o.sprite, scale: this.fireScale(o.prop), duration: 150, ease: 'Back.easeOut' });
    const r = propRect(o.prop);
    const puff = this.add.circle(r.x + r.w / 2, r.y + 10, 7, 0xb8b0a8, 0.5).setDepth(r.y + 70);
    this.tweens.add({ targets: puff, y: puff.y - 30, alpha: 0, scale: 1.6, duration: 500, onComplete: () => puff.destroy() });
  }

  /** Apaga a fogueira (bomba, 3 bolas comuns ou bola molhada/congelada). */
  private putOut(o: PropObj) {
    o.prop.broken = true;
    o.sprite?.setTexture('campfire_out').setScale(1).setDepth(-57);
    const r = propRect(o.prop);
    for (let i = 0; i < 6; i++) {
      const puff = this.add.circle(r.x + r.w / 2 + Phaser.Math.Between(-14, 14), r.y + 20, Phaser.Math.Between(5, 9), 0xb8b0a8, 0.6).setDepth(r.y + 70);
      this.tweens.add({ targets: puff, y: puff.y - 40, alpha: 0, scale: 1.8, duration: 600, onComplete: () => puff.destroy() });
    }
  }

  /** Colisões do gato: pedras e buracos sempre; a mesa só quando ele está no chão. */
  private addPropColliders(slot: Slot, player: Player) {
    for (const o of this.propObjs) {
      const p = o.prop;
      if (!o.body || p.kind === 'chair') continue;
      if (p.kind === 'table') {
        slot.colliders.push(this.physics.add.collider(player.body, o.body, undefined, () => !p.broken && slot.height === 0));
      } else {
        slot.colliders.push(this.physics.add.collider(player.body, o.body, undefined, () => !p.broken));
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

  private fireAt(x: number, y: number) {
    const p = this.propAt(x, y);
    return p?.kind === 'fire' ? this.propObjs.find((o) => o.prop === p) : undefined;
  }

  /**
   * Em cima de quê o gato está: cadeira (sobe direto do chão) ou mesa (só vindo da cadeira ou
   * já em cima dela). Ajusta a altura do desenho para ele aparecer em cima do móvel.
   */
  private updateElevation(slot: Slot) {
    const player = slot.player!;
    const feet = player.feet;
    const under = this.propAt(feet.x, feet.y - 8);
    let h = 0;
    if (under?.kind === 'chair') h = 1;
    else if (under?.kind === 'table' && slot.height >= 1) h = 2;
    slot.height = h;
    const bottom = under ? propRect(under).y + TILE + 2 : 0;
    player.setElevation(h === 1 ? CHAIR_LIFT : h === 2 ? TABLE_LIFT : 0, h ? bottom : 0);
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

  /** Pisar no alçapão leva ao próximo nível (todos os gatos juntos; a chave dourada é perdida). */
  private checkTrapdoor() {
    if (!this.trapdoor || this.leaving) return;
    const on = this.alivePlayers.some((s) => {
      const feet = s.player!.feet;
      return Phaser.Math.Distance.Between(feet.x, feet.y, this.trapdoor!.x, this.trapdoor!.y) <= 30;
    });
    if (!on) return;
    this.leaving = true;
    this.saveRoom();
    sfx(this, 'level');
    this.cameras.main.fadeOut(400);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // Só agora troca o mapa: a sala antiga não pode mais mexer no estado do nível novo
      startNextLevel(this.run);
      const data: RoomData = { run: this.run, room: this.run.floor.startId, newLevel: true };
      this.scene.restart(data);
    });
  }

  /** Se o gato está empurrando uma porta aberta, vai para a sala do outro lado. */
  private checkDoors(slot: Slot) {
    const player = slot.player;
    if (!player || player.dead || this.inCombat || this.leaving) return;
    const b = player.body;
    const feet = player.feet;
    const move = slot.move;
    const midY = Math.abs(feet.y - 10 - GAME_HEIGHT / 2) < 30;
    const midX = Math.abs(feet.x - GAME_WIDTH / 2) < 30;
    const pushing: Record<DoorSide, boolean> = {
      right: midY && move.x > 0 && b.right >= FLOOR.x + FLOOR.width - 1,
      left: midY && move.x < 0 && b.left <= FLOOR.x + 1,
      up: midX && move.y < 0 && b.top <= FLOOR.y + 1,
      down: midX && move.y > 0 && b.bottom >= FLOOR.y + FLOOR.height - 1,
    };
    for (const [side, target] of Object.entries(this.doors) as [DoorSide, RoomId][]) {
      if (!pushing[side] || this.time.now < this.doorPauseUntil) continue;
      if (this.isLocked(side)) this.tryUnlock(slot, side);
      else if (this.isVs) vs.director?.transfer(this, slot, target, OPPOSITE[side]);
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
  private tryUnlock(slot: Slot, side: DoorSide) {
    if (this.time.now < this.nagUntil) return;
    const inv = slot.ps.inventory;
    const usedGolden = inv.goldenKey;
    if (!useKey(inv)) {
      this.nagUntil = this.time.now + 1500;
      this.showBanner('Trancada', 'Precisa de uma chave', '#c8c0b8');
      sfx(this, 'locked');
      this.cameras.main.shake(80, 0.003);
      return;
    }
    this.refreshCounters(usedGolden ? undefined : 'key');
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
    sfx(this, 'unlock');
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

  /** Todos os gatos vão juntos para a sala ao lado. */
  private goToRoom(room: RoomId, enterFrom: DoorSide) {
    this.leaving = true;
    this.saveRoom();
    sfx(this, 'door');
    this.cameras.main.fadeOut(150);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const data: RoomData = { run: this.run, room, enterFrom };
      this.scene.restart(data);
    });
  }

  /** Guarda na partida a vida e o item usável do gato. */
  private saveSlot(slot: Slot) {
    const p = slot.player;
    if (!p) return;
    slot.ps.hp = p.hp;
    slot.ps.shield = p.shield;
    slot.ps.active = p.active ? { id: p.active.id, charge: p.activeCharge } : undefined;
  }

  /** Guarda na partida o que precisa continuar igual quando alguém voltar. */
  saveRoom() {
    for (const slot of this.slots) this.saveSlot(slot);
    this.roomState.items = this.items.filter((i) => !i.collected).map((i) => ({ id: i.info.id, x: i.x, y: i.y, price: i.price }));
    this.roomState.pickups = this.pickups.filter((p) => !p.collected).map((p) => ({ kind: p.kind, x: p.x, y: p.y, tag: p.tag }));
    if (this.chest) this.roomState.chestOpen = this.chest.opened;
    // VS: sala que ninguém limpou volta com inimigos novos; a já limpa fica limpa
  }

  /** O baú dourado é trancado: gasta uma chave (ou usa a dourada) para abrir. */
  private tryOpenChest(slot: Slot) {
    if (!this.chest || this.chest.opened || this.time.now < this.nagUntil) return;
    if (this.chest.variant === 'wood') {
      this.openWoodChest();
      return;
    }
    const inv = slot.ps.inventory;
    const usedGolden = inv.goldenKey;
    if (!useKey(inv)) {
      this.nagUntil = this.time.now + 1500;
      this.showBanner('Baú trancado', 'Precisa de uma chave', '#c8c0b8');
      sfx(this, 'locked');
      return;
    }
    if (!usedGolden) this.refreshCounters('key');
    this.openChest(1, slot.ps.stats.luck);
  }

  /** Abre o baú dourado. Aberto com bomba (`factor` < 1), as chances de item bom caem. */
  private openChest(factor = 1, luck = this.luck) {
    if (!this.chest || !this.chest.open()) return;
    sfx(this, 'chest');
    const rarity = rollRarity(luck, Math.random, factor);
    const id = randomItemOf(rarity);
    const spot = this.freeDropSpot(this.chest.x, this.chest.y);
    this.items.push(new ItemPickup(this, spot.x, spot.y, id, { kind: 'toss', fromX: this.chest.x, fromY: this.chest.y - 30 }));
    const info = RARITY_INFO[rarity];
    this.showBanner(`Item ${info.name.toLowerCase()}!`, ITEMS[id].name, info.color);
  }

  /** Baú de madeira: abre sem chave e solta 2 ou 3 coletáveis (às vezes um item). */
  private openWoodChest() {
    if (!this.chest || !this.chest.open()) return;
    sfx(this, 'chest');
    const { x, y } = this.chest;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const spot = this.freeDropSpot(x, y);
      this.pickups.push(new Pickup(this, spot.x, spot.y, weightedPick(WOOD_CHEST_DROPS), true));
    }
    if (Math.random() < WOOD_CHEST_ITEM_CHANCE * this.dropMult) {
      const spot = this.freeDropSpot(x, y);
      const id = randomItemOf(rollRarity(this.luck));
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
    if (this.roomDef.type === 'devItems') {
      const ids = DEV_ITEM_PAGES[this.roomDef.itemPage ?? 0];
      const spots = devItemSpots(ids.length);
      ids.forEach((id, i) => {
        if (this.items.some((it) => !it.collected && it.info.id === id)) return;
        this.items.push(new ItemPickup(this, spots[i].x, spots[i].y, id, spawn));
      });
      return;
    }
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
  private placeBomb(slot: Slot) {
    if (this.isVs && !slot.ps.alive) {
      vs.director?.nextSpectate(slot.ps.idx);
      return;
    }
    const player = slot.player;
    const inv = slot.ps.inventory;
    if (this.leaving || this.finished || !player || player.dead || inv.bombs <= 0) return;
    inv.bombs -= 1;
    this.refreshCounters('bomb');
    sfx(this, 'bombPlace');
    const feet = player.feet;
    const bomb = new Bomb(this, feet.x, feet.y + 2, (b) => this.explode(b));
    bomb.owner = slot.ps.idx;
    // Os gatos empurram a bomba, mas só depois de sair de cima dela.
    for (const s of this.slots) {
      if (!s.player) continue;
      const c = this.physics.add.collider(s.player.body, bomb.body, undefined, () => bomb.solid);
      bomb.colliders.push(c);
      s.colliders.push(c);
    }
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
      if (!bomb.solid && !this.slots.some((s) => s.player && this.physics.overlap(s.player.body, bomb.body))) bomb.solid = true;
      bomb.update(dt, time);
    }
    this.bombs = this.bombs.filter((b) => !b.exploded);
  }

  /** Explosão: dano por perto, marca no chão e tudo ao redor lançado para longe. */
  private explode(bomb: Bomb) {
    const { x, y } = bomb;
    playExplosion(this, x, y);
    sfx(this, 'explode');
    // Baú por perto: abre sem chave (o dourado fica com chances piores, até a metade)
    if (this.chest && !this.chest.opened && Phaser.Math.Distance.Between(x, y, this.chest.x, this.chest.y) < BLAST_RADIUS + 20) {
      if (this.chest.variant === 'wood') this.openWoodChest();
      else this.openChest(Phaser.Math.FloatBetween(0.5, 1));
    }
    // Portas trancadas por perto: podem abrir ou rachar
    for (const side of Object.keys(this.doors) as DoorSide[]) {
      if (!this.isLocked(side)) continue;
      const d = DOOR_POS[side];
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
      if (p.kind === 'fire') {
        this.putOut(o);
        continue;
      }
      p.broken = true;
      o.sprite?.setTexture(this.propTexture(p)).setDepth(-57);
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

    for (const s of this.slots) {
      const p = s.player;
      if (!p) continue;
      const feet = p.feet;
      if (Phaser.Math.Distance.Between(x, y, feet.x, feet.y) < BLAST_RADIUS) p.takeDamage(BOMB_DAMAGE_PLAYER, x, y);
    }
    for (const e of this.enemies) {
      if (e.dead || Phaser.Math.Distance.Between(x, y, e.x, e.y) > BLAST_RADIUS + e.radius) continue;
      const a = Math.atan2(e.y - y, e.x - x);
      if (bomb.owner >= 0) e.lastHitBy = bomb.owner;
      e.takeHit(Math.cos(a), Math.sin(a), BOMB_DAMAGE_ENEMY);
      if (this.showDamage) this.showDamageNumber(e.x, e.y - 50, BOMB_DAMAGE_ENEMY);
    }
    if (this.dummy?.alive && Phaser.Math.Distance.Between(x, y, this.dummy.x, this.dummy.y) < BLAST_RADIUS + 20) {
      const a = Math.atan2(this.dummy.y - y, this.dummy.x - x);
      this.dummy.takeHit(Math.cos(a), Math.sin(a), BOMB_DAMAGE_ENEMY);
      if (this.showDamage) this.showDamageNumber(this.dummy.x, this.dummy.y - 70, BOMB_DAMAGE_ENEMY);
    }
  }

  /** Atualiza os contadores de todos os HUDs (no co-op o inventário é dividido). */
  private refreshCounters(bump?: PickupKind) {
    for (const s of this.slots) s.hud.updateCounters(bump);
  }

  private checkPickups(time: number) {
    for (const p of this.pickups) {
      p.update(time);
      for (const slot of this.slots) {
        const player = slot.player;
        if (!player || player.dead || !p.touches(player.feet.x, player.feet.y)) continue;
        // Coração vermelho com a vida cheia fica no chão, como no Isaac.
        if ((p.kind === 'heart' || p.kind === 'halfHeart') && player.hp >= player.maxPoints) continue;
        const target = slot.hud.counterPosition(p.kind);
        const inv = slot.ps.inventory;
        p.collect(target.x, target.y, () => {
          if (p.kind === 'blueHeart') player.addShield(HEART_POINTS.blueHeart!);
          else if (isHeart(p.kind)) player.heal(HEART_POINTS[p.kind]!);
          else {
            addPickup(inv, p.kind);
            this.refreshCounters(p.kind);
          }
        });
        sfx(this, p.kind === 'coin' ? 'coin' : isHeart(p.kind) ? 'heart' : 'pickup');
        if (p.kind === 'goldenKey') this.showBanner('Chave dourada', 'Abre portas e baús sem gastar chaves neste nível', '#f2c879');
        break;
      }
    }
    this.pickups = this.pickups.filter((p) => !p.collected);
  }

  /** Põe à venda itens sorteados nos espaços vazios da bancada (3 no total). */
  private stockShop(animate = false) {
    const slots = [-1, 0, 1].map((i) => ({ x: GAME_WIDTH / 2 + i * SHOP_ITEM_GAP, y: SHOP_ITEM_Y }));
    const free = slots.filter((s) => !this.items.some((it) => !it.collected && it.x === s.x && it.y === s.y));
    const forSale = this.items.filter((it) => !it.collected).map((it) => it.info.id);
    const ids = rollShopItems(this.luck, free.length, forSale);
    free.forEach((slot, i) => {
      const id = ids[i];
      this.items.push(new ItemPickup(this, slot.x, slot.y, id, animate ? { kind: 'pop' } : { kind: 'none' }, priceOf(id)));
    });
  }

  /** Compra um item da loja, se houver moedas. */
  private tryBuy(slot: Slot, item: ItemPickup) {
    const price = item.price ?? 0;
    const inv = slot.ps.inventory;
    if (inv.coins < price) {
      if (this.time.now >= this.nagUntil) {
        this.nagUntil = this.time.now + 1500;
        this.vendor?.say(`Faltam ${price - inv.coins} moedas!`);
      }
      return false;
    }
    inv.coins -= price;
    this.refreshCounters('coin');
    this.vendor?.say('Obrigado! Miau!', true);
    sfx(this, 'coin');
    return true;
  }

  private checkItems(time: number) {
    for (const item of this.items) {
      item.update(time);
      for (const slot of this.slots) {
        const player = slot.player;
        if (!player || player.dead || item.collected || !item.touches(player.feet.x, player.feet.y)) continue;
        if (item.price !== undefined && !this.tryBuy(slot, item)) continue;
        const feet = player.feet;
        item.collect(feet.x, feet.y);
        const old = player.collect(item.info);
        if (!item.info.active) {
          slot.ps.score ??= { kills: 0, items: 0, bosses: 0 };
          slot.ps.score.items++;
        }
        // Trocou de item usável: o antigo fica no chão onde estava o novo
        if (old) this.items.push(new ItemPickup(this, item.x, item.y, old.id, { kind: 'drop' }));
        // Co-op com itens compartilhados: o item vale para o outro gato também
        if (this.run.mode === 'coop' && this.run.sharedItems && !item.info.active) this.shareItem(slot, item.info);
        const rarity = RARITY_INFO[item.info.rarity];
        this.showBanner(item.info.name, `${item.info.effect}  ·  ${rarity.name}`, rarity.color);
        sfx(this, 'item');
        break;
      }
    }
    this.items = this.items.filter((i) => !i.collected);
  }

  private shareItem(from: Slot, info: ItemInfo) {
    for (const s of this.slots) {
      if (s === from) continue;
      if (s.player && !s.player.dead) s.player.collect(info);
      else applyItem(s.ps.stats, info);
    }
    // Quem não está na sala (não acontece no co-op, mas por garantia)
    for (const ps of this.run.players) {
      if (!this.slots.some((s) => s.ps === ps) && ps !== from.ps) applyItem(ps.stats, info);
    }
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

  private checkSpikes(slot: Slot) {
    const player = slot.player;
    if (!player || player.dead) return;
    const feet = player.body;
    const feetRect = new Phaser.Geom.Rectangle(feet.x, feet.y, feet.width, feet.height);
    for (const r of this.spikeRects) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(feetRect, r)) {
        player.takeDamage(1, r.centerX, r.centerY);
        return;
      }
    }
  }

  // ---------- Item usável ----------

  private useActive(slot: Slot) {
    if (this.isVs && !slot.ps.alive) {
      vs.director?.nextSpectate(slot.ps.idx);
      return;
    }
    if (this.leaving || this.finished) return;
    const player = slot.player;
    const item = player?.active;
    if (!player || player.dead || !item?.active) return;
    if (!player.useActive()) {
      if (this.time.now >= this.nagUntil) {
        this.nagUntil = this.time.now + 800;
        this.showBanner(item.name, 'Ainda recarregando…', '#c8c0b8');
      }
      return;
    }
    sfx(this, 'power');
    const what = item.active.effect === 'invincible' ? 'Imortal' : 'Dano 2x';
    this.showBanner(item.name, `${what} por ${item.active.duration} segundos!`, '#f2c879');
  }

  // ---------- Gatinhos pedinte e vampiro ----------

  /** Encostar no gatinho: o pedinte recebe 1 moeda; o vampiro, 1 ponto de vida. */
  private touchNpc(slot: Slot) {
    const npc = this.npc;
    const player = slot.player;
    if (!npc || npc.gone || !player || player.dead || this.time.now < this.npcCooldownUntil) return;
    this.npcCooldownUntil = this.time.now + 700;
    const state = (this.roomState.npc ??= { given: 0, gone: false });
    const inv = slot.ps.inventory;
    let chance: number;
    if (npc.kind === 'beggar') {
      if (inv.coins <= 0) {
        npc.say('Sem moedinha? Tudo bem…');
        return;
      }
      inv.coins -= 1;
      this.refreshCounters('coin');
      chance = BEGGAR_ITEM_CHANCE;
    } else {
      // Não deixa o gato morrer doando: precisa sobrar pelo menos meio coração
      if (player.hp <= 1) {
        npc.say('Você está fraquinho demais…');
        return;
      }
      player.donateBlood(1);
      slot.ps.bloodDonated += 1;
      chance = VAMPIRE_ITEM_CHANCE;
      this.checkVampireReward(slot);
    }
    npc.thank();
    sfx(this, 'meow');
    if (Math.random() >= chance) {
      npc.say(npc.kind === 'beggar' ? 'Obrigado!' : 'Hmm… delícia.');
      return;
    }
    // Presente: item com as mesmas chances do baú (a sorte ajuda)
    const id = randomItemOf(rollRarity(slot.ps.stats.luck));
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
  private checkVampireReward(slot: Slot) {
    const ps = slot.ps;
    if (ps.vampireReward || ps.bloodDonated < VAMPIRE_REWARD_BLOOD || slot.player?.hp !== 1) return;
    ps.vampireReward = true;
    const feet = slot.player.feet;
    const spot = this.freeDropSpot(feet.x, feet.y - 40);
    this.items.push(new ItemPickup(this, spot.x, spot.y, 'vampire', { kind: 'pop' }));
    this.showBanner('Presente do vampiro!', 'Uma capa e dois dentinhos', '#c83040');
  }

  /** Nome embaixo de cada item na sala de teste. */
  private labelDevItems() {
    const ids = DEV_ITEM_PAGES[this.roomDef.itemPage ?? 0];
    const spots = devItemSpots(ids.length);
    ids.forEach((id, i) => {
      this.add
        .text(spots[i].x, spots[i].y + 22, ITEMS[id].name, { fontFamily: 'monospace', fontSize: '11px', color: '#b8a898', stroke: '#1a1210', strokeThickness: 3 })
        .setOrigin(0.5, 0)
        .setDepth(-40);
    });
    const title = this.roomDef.itemPage ? 'Itens usáveis e elementais' : 'Itens passivos';
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, `${title}
"+ Repor itens" coloca tudo de volta`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#8a7a6a',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(-40);
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

  // ---------- HUD ----------

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
    this.updateStats(this.mainPs.stats, false);
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
  showBanner(title: string, subtitle: string, color = '#f2c879') {
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
    // No multiplayer o botão é só de quem hospeda (os outros têm o próprio botão Sair)
    const label = this.isMulti ? '↺ Sala (Esc)' : '↺ Início (Esc)';
    const back = this.makeButton(GAME_WIDTH - 20 - 66, y, 132, label, () => this.backToSelect());
    if (this.isMulti) markOwner(back.parentContainer!, net.myIdx);
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

  /** Volta para a tela de seleção (no multiplayer, todos voltam para a sala de espera). */
  private backToSelect() {
    if (this.isMulti) {
      if (this.hs) returnToLobby(this.game);
      return;
    }
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(200);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start('Select', { cat: this.mainPs.cat, mode: this.run.mode }),
    );
  }

  /**
   * Fim da partida multiplayer: qualquer jogador (não só quem hospeda) pode apertar para todos
   * voltarem juntos para a sala de espera.
   */
  private checkRemoteRestart() {
    const hs = this.hs;
    if (!hs || this.leaving) return;
    if (this.finishedAt === undefined) {
      this.finishedAt = this.time.now;
      for (const idx of hs.inputs.keys()) hs.takeActions(idx); // ignora o que foi apertado antes
      return;
    }
    if (this.time.now - this.finishedAt < 1200) return;
    for (const idx of [...hs.inputs.keys()]) {
      if (hs.bots.has(idx)) continue;
      const acts = hs.takeActions(idx);
      if (acts.bomb || acts.item || acts.tap || hs.input(idx)?.fire) {
        this.leaving = true;
        returnToLobby(this.game);
        return;
      }
    }
  }

  private finishedAt?: number;

  /** Recomeçar depois do fim: no multiplayer, volta todo mundo para a sala de espera. */
  private restartGame() {
    if (this.isMulti) {
      returnToLobby(this.game);
      return;
    }
    const again: RoomData = { cat: this.mainPs.cat, mode: this.run.mode };
    this.scene.restart(again);
  }

  /** Tela de vitória depois do boss do último nível. */
  private showVictory() {
    this.finished = true; // os gatos param; nada mais acontece na sala
    for (const s of this.slots) s.player?.body.velocity.set(0, 0);
    sfx(this, 'victory');
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setDepth(30_000);
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 6 };
    const title = this.add
      .text(cx, cy - 40, this.isMulti ? 'Vocês venceram!' : 'Você venceu!', { ...style, fontSize: '52px', color: '#f2c879' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    const detail = this.add
      .text(cx, cy + 14, `Os ${MAX_LEVEL} porões estão livres dos monstros.`, { ...style, fontSize: '20px', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    const sub = this.add
      .text(cx, cy + 56, this.restartHint(), { ...style, fontSize: '18px', strokeThickness: 4, color: '#b8a898' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    this.tweens.add({ targets: overlay, fillAlpha: 0.6, duration: 700 });
    this.tweens.add({ targets: [title, detail, sub], alpha: 1, duration: 700, delay: 300 });
    title.setScale(0.6);
    this.tweens.add({ targets: title, scale: 1, duration: 700, delay: 300, ease: 'Back.Out' });
    this.waitRestart(overlay);
  }

  private restartHint() {
    if (this.isMulti) return 'R, A ou toque: todos voltam para a sala de espera';
    return this.touch ? 'Toque para jogar de novo' : 'R para jogar de novo  ·  Esc para trocar de gato';
  }

  /** R, A/Start no controle ou um toque recomeçam (no multiplayer, só quem hospeda). */
  private waitRestart(overlay: Phaser.GameObjects.Rectangle) {
    this.input.keyboard!.once('keydown-R', () => this.restartGame());
    this.waitPadButton(() => this.restartGame());
    this.time.delayedCall(900, () => {
      overlay.setInteractive();
      overlay.once('pointerdown', () => this.restartGame());
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
    this.finished = this.isMulti; // no multiplayer a sala para (o anfitrião decide quando voltar)
    sfx(this, 'defeat');
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
      .text(cx, cy + 34, this.restartHint(), { ...style, fontSize: '20px', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30_001);
    this.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 600, delay: 400 });
    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 600, delay: 600 });
    this.waitRestart(overlay);
  }

  // ---------- VS ----------

  /** Tempo até o tabuleiro encolher (no topo) e a lista de gatos vivos (na lateral). */
  private createVsHud() {
    this.vsTimer = this.add
      .text(GAME_WIDTH / 2, 18, '', { fontFamily: 'monospace', fontSize: '18px', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 4 })
      .setOrigin(0.5, 0)
      .setDepth(40_000);
    this.drawAliveList();
  }

  /** Lista lateral: foto e nome de cada gato; quem caiu fica apagado e deitado. */
  drawAliveList() {
    for (const o of this.aliveList) o.destroy();
    this.aliveList = [];
    const x = 30;
    let y = 392; // abaixo da porta da esquerda
    for (const ps of this.run.players) {
      const out = !ps.alive;
      const face = this.add
        .image(x, y, `cat_${ps.cat}`, 0)
        .setScale(0.42)
        .setDepth(40_000)
        .setAngle(out ? 90 : 0)
        .setAlpha(out ? 0.45 : 1);
      if (out) face.setTint(0x777777);
      const name = this.add
        .text(x + 26, y, ps.name, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: out ? '#6a5a4a' : '#e8d9c4',
          stroke: '#1a1210',
          strokeThickness: 3,
        })
        .setOrigin(0, 0.5)
        .setDepth(40_000);
      this.aliveList.push(face, name);
      y += 44;
    }
  }

  private updateVsHud() {
    const board = this.run.vs;
    const timer = this.vsTimer;
    if (!board || !timer) return;
    const director = vs.director;
    const next = director?.nextShrinkIn();
    if (next === undefined) {
      timer.setText('');
    } else {
      const s = Math.max(0, Math.ceil(next));
      const txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      const warn = s <= 10;
      timer.setText(warn ? `ALERTA! O mapa encolhe em ${txt}` : `O mapa encolhe em ${txt}`);
      timer.setColor(warn ? '#ff5050' : '#e8d9c4');
    }
    // Esta sala vai ser destruída: aviso piscando
    const doomedSoon = director?.isDoomedSoon(this.def);
    if (doomedSoon && !this.doomText) {
      this.doomText = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120, 'Esta sala vai ser destruída! Saia!', {
          fontFamily: 'monospace',
          fontSize: '26px',
          color: '#ff4040',
          stroke: '#1a0505',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(36_000);
      this.tweens.add({ targets: this.doomText, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 });
    } else if (!doomedSoon && this.doomText) {
      this.doomText.destroy();
      this.doomText = undefined;
    }
    for (const s of this.slots) if (s.map) s.map.warning = !!director?.warning;
  }

  /** O tabuleiro encolheu: portas para salas que sumiram ficam gradeadas; mapas atualizam. */
  refreshDoorsAfterShrink() {
    for (const side of Object.keys(DOOR_POS) as DoorSide[]) {
      if (this.sealed.has(side) || this.doors[side]) continue;
      // Havia porta aqui? (o desenho da sala tem a abertura)
      if (!this.hadDoor(side)) continue;
      this.sealed.add(side);
      drawDoorBars(this, side).setAlpha(0.9);
    }
    for (const s of this.slots) s.map?.draw();
  }

  private hadDoor(side: DoorSide) {
    const r = this.def;
    const step: Record<DoorSide, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = step[side];
    const board = this.run.vs;
    if (!board) return false;
    const x = r.gx + dx;
    const y = r.gy + dy;
    return x >= 0 && y >= 0 && x < board.w && y < board.h && this.openedAtStart.has(side);
  }

  /** Portas que a sala tinha quando foi criada. */
  private get openedAtStart() {
    return (this._doorsAtStart ??= new Set(Object.keys(this.doors) as DoorSide[]));
  }

  private _doorsAtStart?: Set<DoorSide>;

  /** A sala foi destruída com gatos dentro: todos caem. */
  destroyRoom() {
    this.doomed = true;
    for (const s of this.slots) s.player?.kill();
    this.cameras.main.shake(600, 0.02);
    sfx(this, 'shrink');
  }

  /** "Assistindo fulano" para quem já caiu (só ele vê). */
  spectatorLabel(idx: number, name: string) {
    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 16, `Assistindo ${name}  ·  bomba ou item: trocar`, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#7ad6ff',
        stroke: '#1a1210',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(36_000);
    markOwner(t, idx);
    if (idx !== net.myIdx) this.cameras.main.ignore(t);
    return t;
  }

  /** Mensagem para quem foi eliminado (só ele vê). */
  private showEliminated(slot: Slot) {
    if (slot.outShown) return;
    slot.outShown = true;
    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 120, 'Você foi eliminado', {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: '#c8c0b8',
        stroke: '#1a1210',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(36_000);
    markOwner(t, slot.ps.idx);
    if (!slot.local) this.cameras.main.ignore(t);
  }

  /** Fim do VS: mostra quem venceu (todas as salas). */
  showVsWinner(winner?: PlayerState) {
    this.finished = true;
    for (const s of this.slots) s.map?.setBig(false);
    sfx(this, winner && this.slots.some((s) => s.local && s.ps === winner) ? 'victory' : 'defeat');
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setDepth(50_000);
    const style = { fontFamily: 'monospace', color: '#e8d9c4', stroke: '#1a1210', strokeThickness: 6 };
    this.add
      .text(cx, 70, winner ? `${winner.name} venceu!` : 'Empate!', { ...style, fontSize: '44px', color: '#f2c879' })
      .setOrigin(0.5)
      .setDepth(50_001);
    this.drawScoreboard(winner, 140);
    this.add
      .text(cx, GAME_HEIGHT - 50, this.restartHint(), { ...style, fontSize: '18px', strokeThickness: 4, color: '#b8a898' })
      .setOrigin(0.5)
      .setDepth(50_001);
    this.waitRestart(overlay);
  }

  /**
   * Placar do VS: o vencedor (último vivo) sempre em 1º; os outros pela pontuação. A estrela
   * marca a maior pontuação, mesmo de quem caiu antes.
   */
  private drawScoreboard(winner: PlayerState | undefined, top: number) {
    const rest = this.run.players.filter((p) => p !== winner).sort((a, b) => vsPoints(b) - vsPoints(a) || (b.outAt ?? 0) - (a.outAt ?? 0));
    const rows = winner ? [winner, ...rest] : rest;
    const best = Math.max(...rows.map(vsPoints));
    const cols = [
      { x: 110, title: '#', align: 0.5 },
      { x: 180, title: 'Jogador', align: 0 },
      { x: 520, title: 'Criaturas', align: 0.5 },
      { x: 640, title: 'Itens', align: 0.5 },
      { x: 740, title: 'Bosses', align: 0.5 },
      { x: 850, title: 'Pontos', align: 0.5 },
    ];
    const D = 50_001;
    const text = (x: number, y: number, s: string, size: number, color: string, ox = 0.5) =>
      this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: `${size}px`, color, stroke: '#1a1210', strokeThickness: 3 }).setOrigin(ox, 0.5).setDepth(D);
    this.add.rectangle(GAME_WIDTH / 2, top + 20 + rows.length * 36, 820, 50 + rows.length * 72, 0x1a1412, 0.85).setStrokeStyle(2, 0x5a4a3c).setDepth(D - 0.5);
    for (const c of cols) text(c.x, top + 20, c.title, 14, '#b8a898', c.align);
    rows.forEach((ps, i) => {
      const y = top + 70 + i * 66;
      const s = ps.score ?? { kills: 0, items: 0, bosses: 0 };
      const pts = vsPoints(ps);
      const color = i === 0 && winner ? '#f2c879' : ps.alive ? '#e8d9c4' : '#b8a898';
      if (i > 0) this.add.rectangle(GAME_WIDTH / 2, y - 33, 780, 1, 0x5a4a3c).setDepth(D);
      text(cols[0].x, y, i === 0 && winner ? '👑' : `${i + 1}º`, 20, color);
      this.add.image(cols[1].x + 26, y + 4, `cat_${ps.cat}`, 0).setScale(0.42).setDepth(D);
      text(cols[1].x + 64, y, ps.name, 20, color, 0);
      text(cols[2].x, y, String(s.kills), 20, color);
      text(cols[3].x, y, String(s.items), 20, color);
      text(cols[4].x, y, String(s.bosses), 20, color);
      text(cols[5].x, y, `${pointsLabel(pts, best, rows.length)}`, 20, pts === best && pts > 0 ? '#7ad6ff' : color);
    });
    function pointsLabel(p: number, b: number, n: number) {
      return p === b && p > 0 && n > 1 ? `★ ${p}` : String(p);
    }
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

