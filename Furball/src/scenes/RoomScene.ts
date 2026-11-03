import Phaser from 'phaser';
import { FLOOR, GAME_HEIGHT, GAME_WIDTH, TILE, WALL } from '../config';
import { CatId, PLAYABLE } from '../cats';
import { ITEMS, ItemId, randomItemOf } from '../items';
import { Bomb } from '../objects/Bomb';
import { Chest } from '../objects/Chest';
import { DummyCat } from '../objects/DummyCat';
import { Furball, createFurballTexture } from '../objects/Furball';
import { ItemPickup, ItemSpawn } from '../objects/ItemPickup';
import { Pickup } from '../objects/Pickup';
import { Vendor } from '../objects/Vendor';
import { Facing, Player } from '../objects/Player';
import { HEART_POINTS, PICKUP_FRAME, PickupKind, addPickup, isHeart, useKey } from '../pickups';
import { RARITY_INFO, RARITY_ORDER, rarityOdds, rollRarity } from '../rarity';
import { RoomId, RoomState, Run, newRun } from '../run';
import { STAT_LABELS, Stats, formatMult } from '../stats';
import { TouchControls, isTouchDevice } from '../ui/TouchControls';
import { drawScorch, playExplosion } from '../world/explosion';
import { priceOf, rollShopItems } from '../shop';
import { DoorSide, drawLockedDoor, drawRoom } from '../world/room';

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

// Bomba: até onde causa dano e até onde empurra as coisas.
const BLAST_RADIUS = 110;
const KNOCK_RADIUS = 220;
const KNOCK_MAX = 260; // distância que algo colado na bomba é lançado
const BOMB_DAMAGE_PLAYER = 2; // 1 coração
const BOMB_DAMAGE_ENEMY = 10;

// Corações no HUD: quantos por linha e o espaçamento.
const HEARTS_PER_ROW = 8;
const HEART_GAP = 34;
const HEART_ROW_H = 30;

/** Portas abertas de cada sala e para onde levam. */
const DOORS: Record<RoomId, Partial<Record<DoorSide, RoomId>>> = {
  start: { right: 'treasure', up: 'shop' },
  treasure: { left: 'start' },
  shop: { down: 'start' },
};

/** Portas que começam trancadas (precisam de uma chave), como "sala:lado". */
const LOCKED_DOORS = ['start:up'];

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
  run?: Run;
  room?: RoomId;
  /** Porta por onde o gato entrou. */
  enterFrom?: DoorSide;
}

export class RoomScene extends Phaser.Scene {
  private run!: Run;
  private roomId: RoomId = 'start';
  private enterFrom?: DoorSide;
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
  private touch?: TouchControls;
  /** Desenhos das portas trancadas desta sala, por lado. */
  private locks = new Map<DoorSide, Phaser.GameObjects.Graphics>();
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

  /** Sem `run`, começa uma partida nova (vinda da seleção ou do R). */
  init(data: RoomData) {
    this.run = data.run ?? newRun(data.cat ?? 'black');
    this.roomId = data.room ?? 'start';
    this.enterFrom = data.enterFrom;
  }

  create() {
    this.leaving = false;
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
    this.locks.clear();
    this.nagUntil = 0;
    this.doorPauseUntil = 0;
    createFurballTexture(this, this.cat);
    drawRoom(this, Object.keys(DOORS[this.roomId]) as DoorSide[]);
    this.physics.world.setBounds(FLOOR.x, FLOOR.y, FLOOR.width, FLOOR.height);

    for (const side of Object.keys(DOORS[this.roomId]) as DoorSide[]) {
      if (this.isLocked(side)) this.locks.set(side, drawLockedDoor(this, side));
    }

    const firstVisit = !this.run.rooms[this.roomId];
    for (const sc of this.roomState.scorches ?? []) drawScorch(this, sc.x, sc.y, sc.seed);
    if (this.roomId === 'start') {
      this.drawSpikes();
      // Gato de teste parado no meio da sala.
      this.dummy = new DummyCat(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12, 'gray');
    } else if (this.roomId === 'treasure') {
      this.chest = new Chest(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, !!this.roomState.chestOpen);
    } else if (this.roomId === 'shop') {
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
    if (firstVisit && this.roomId === 'start') this.respawnItems(false);

    const spawn = this.spawnPoint();
    this.player = new Player(this, spawn.x, spawn.y, this.cat, this.run.stats, this.run.hp, this.run.shield, spawn.facing);
    if (this.dummy) this.physics.add.collider(this.player.body, this.dummy.body);
    if (this.chest) this.physics.add.collider(this.player.body, this.chest.body, () => this.tryOpenChest());
    if (this.vendor) this.physics.add.collider(this.player.body, this.vendor.body);
    this.player.on('hp', () => this.updateHearts(true));
    this.player.on('stats', (stats: Stats) => this.updateStats(stats));
    this.player.on('dead', () => this.showGameOver());

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.moveKeys = kb.addKeys({ w: K.W, a: K.A, s: K.S, d: K.D }) as MoveKeys;
    this.aimKeys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT }) as AimKeys;
    kb.addCapture([K.UP, K.DOWN, K.LEFT, K.RIGHT]); // não rolar a página com as setas
    kb.on('keydown-ESC', () => this.backToSelect());
    kb.on('keydown-E', () => this.placeBomb());
    this.touch = isTouchDevice(this) ? new TouchControls(this, () => this.placeBomb()) : undefined;

    this.createHud();

    if (!this.enterFrom) {
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
    if (this.leaving) return;
    // Limita o passo para a física não dar saltos se a aba ficar em segundo plano.
    const dt = Math.min(deltaMs, 50) / 1000;

    const k = this.moveKeys;
    this.move.set((k.d.isDown ? 1 : 0) - (k.a.isDown ? 1 : 0), (k.s.isDown ? 1 : 0) - (k.w.isDown ? 1 : 0));
    if (this.touch && this.touch.move.lengthSq() > 0) this.move.copy(this.touch.move);
    const aim = this.currentAim() ?? this.touch?.aim ?? null;

    if (this.hint && (this.move.lengthSq() > 0 || aim)) {
      const hint = this.hint;
      this.hint = undefined;
      this.tweens.add({ targets: hint, alpha: 0, duration: 800, delay: 2000, onComplete: () => hint.destroy() });
    }

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
    }
    this.dummy?.update(time);
    this.vendor?.update(time);
    this.furballs = this.furballs.filter((f) => !f.dead);

    this.checkSpikes();
    this.checkItems(time);
    this.checkPickups(time);
    this.updateBombs(dt, time);
    this.checkDoors();
  }

  /** Se o gato está empurrando uma porta aberta, vai para a sala do outro lado. */
  private checkDoors() {
    if (this.player.dead) return;
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
    for (const [side, target] of Object.entries(DOORS[this.roomId]) as [DoorSide, RoomId][]) {
      if (!pushing[side] || this.time.now < this.doorPauseUntil) continue;
      if (this.isLocked(side)) this.tryUnlock(side);
      else this.goToRoom(target, OPPOSITE[side]);
      return;
    }
  }

  /** A porta está trancada? (as duas salas ligadas pela porta compartilham o estado) */
  private isLocked(side: DoorSide) {
    const here = `${this.roomId}:${side}`;
    const target = DOORS[this.roomId][side];
    const there = target ? `${target}:${OPPOSITE[side]}` : '';
    const locked = LOCKED_DOORS.includes(here) || LOCKED_DOORS.includes(there);
    return locked && !this.run.unlocked.includes(here) && !this.run.unlocked.includes(there);
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
    this.run.unlocked.push(`${this.roomId}:${side}`);
    this.updateCounters(usedGolden ? undefined : 'key');
    // O cadeado cai e a porta some
    const lock = this.locks.get(side);
    this.locks.delete(side);
    if (lock) {
      this.tweens.add({ targets: lock, alpha: 0, y: lock.y + 10, duration: 300, onComplete: () => lock.destroy() });
    }
    this.doorPauseUntil = this.time.now + 450; // dá tempo de ver a porta abrindo antes de passar
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
    this.roomState.items = this.items.filter((i) => !i.collected).map((i) => ({ id: i.info.id, x: i.x, y: i.y, price: i.price }));
    this.roomState.pickups = this.pickups.filter((p) => !p.collected).map((p) => ({ kind: p.kind, x: p.x, y: p.y, tag: p.tag }));
    if (this.chest) this.roomState.chestOpen = this.chest.opened;
  }

  /** Abre o baú e sorteia um item pela sorte do gato. */
  /** O baú é trancado: gasta uma chave (ou usa a dourada) para abrir. */
  private tryOpenChest() {
    if (!this.chest || this.chest.opened || this.time.now < this.nagUntil) return;
    const usedGolden = this.run.inventory.goldenKey;
    if (!useKey(this.run.inventory)) {
      this.nagUntil = this.time.now + 1500;
      this.showBanner('Baú trancado', 'Precisa de uma chave', '#c8c0b8');
      return;
    }
    if (!usedGolden) this.updateCounters('key');
    this.openChest();
  }

  private openChest() {
    if (!this.chest || !this.chest.open()) return;
    const rarity = rollRarity(this.run.stats.luck);
    const id = randomItemOf(rarity);
    const spot = this.freeDropSpot(this.chest.x, this.chest.y);
    this.items.push(
      new ItemPickup(this, spot.x, spot.y, id, { kind: 'toss', fromX: this.chest.x, fromY: this.chest.y - 30 }),
    );
    const info = RARITY_INFO[rarity];
    this.showBanner(`Item ${info.name.toLowerCase()}!`, ITEMS[id].name, info.color);
  }

  private freeDropSpot(cx: number, cy: number) {
    for (const [dx, dy] of DROP_SPOTS) {
      const x = cx + dx;
      const y = cy + dy;
      if (!this.items.some((i) => !i.collected && Phaser.Math.Distance.Between(i.x, i.y, x, y) < 40)) return { x, y };
    }
    return { x: cx + Phaser.Math.Between(-120, 120), y: cy + Phaser.Math.Between(60, 140) };
  }

  /** Botão de teste: na sala inicial repõe os itens; na do tesouro, fecha o baú de novo. */
  private respawnItems(animate = true) {
    if (this.chest) {
      if (this.chest.opened) this.chest.close();
      return;
    }
    if (this.vendor) {
      this.stockShop(true);
      return;
    }
    const spawn: ItemSpawn = animate ? { kind: 'pop' } : { kind: 'none' };
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
        this.player.collect(item.info);
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
    this.createTopButtons();
    this.createStatsPanel();
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
    const refill = this.roomId === 'treasure' ? '+ Novo baú' : this.roomId === 'shop' ? '+ Repor loja' : '+ Repor itens';
    this.makeButton(GAME_WIDTH - 162 - 56, y, 112, refill, () => this.respawnItems());
    const damageButton = this.makeButton(GAME_WIDTH - 284 - 58, y, 116, '', () => {
      this.registry.set('showDamage', !this.showDamage);
      damageButton.setText(this.damageLabel());
    });
    damageButton.setText(this.damageLabel());
  }

  private get showDamage(): boolean {
    return this.registry.get('showDamage') ?? true;
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
      this.scene.start('Select', { cat: this.cat }),
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
      const pts = Phaser.Math.Clamp(hp - i * 2, 0, 2);
      frames.push(pts === 2 ? 0 : pts === 1 ? 2 : 1);
    }
    for (let i = 0; i < Math.ceil(shield / 2); i++) {
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
    kb.once('keydown-R', () => this.scene.restart({ cat: this.cat }));
    // No celular: tocar na tela recomeça (o botão Início continua levando à seleção)
    this.time.delayedCall(900, () => {
      overlay.setInteractive();
      overlay.once('pointerdown', () => this.scene.restart({ cat: this.cat }));
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
