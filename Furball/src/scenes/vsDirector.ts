import Phaser from 'phaser';
import { PlayerState, Run } from '../run';
import { RoomDef } from '../world/floor';
import { DoorSide } from '../world/room';
import { SHRINK_WARNING, inRect, stageTime } from '../world/vsfloor';
import { net } from '../net/peer';
import { endSession, session } from '../net/session';
import type { RoomScene, Slot } from './RoomScene';

// Modo VS do lado de quem hospeda: cada sala com gatos dentro é uma cena rodando ao mesmo tempo
// (só a do gato deste aparelho aparece na tela). Também cuida do tempo e do tabuleiro encolhendo.

interface Pending {
  ps: PlayerState;
  enterFrom?: DoorSide;
  bigMap: boolean;
}

/** Fábrica de cenas de sala (evita importar a classe aqui). */
let makeRoomScene: ((key: string) => RoomScene) | undefined;
export function registerRoomScene(factory: (key: string) => RoomScene) {
  makeRoomScene = factory;
}

export class VsDirector {
  readonly scenes = new Map<string, RoomScene>();
  private pending = new Map<string, Pending[]>();
  /** Cena que aparece na tela deste aparelho. */
  localScene?: RoomScene;
  /** Alarme dos 10 s antes de encolher. */
  warning = false;
  private lastAlarm = -1;
  private finished = false;
  private readonly step = (_t: number, delta: number) => this.tick(Math.min(delta, 100) / 1000);

  constructor(
    private readonly game: Phaser.Game,
    readonly run: Run,
  ) {
    game.events.on(Phaser.Core.Events.STEP, this.step);
  }

  dispose() {
    this.game.events.off(Phaser.Core.Events.STEP, this.step);
    for (const s of this.scenes.values()) this.game.scene.remove(s.sys.settings.key);
    this.scenes.clear();
  }

  /** Começo: cada gato na sua sala de início, com o mapa grande aberto. */
  start() {
    const board = this.run.vs!;
    this.run.players.forEach((ps, i) => {
      ps.room = board.spawns[i];
      ps.seen = [];
      this.enter(ps, board.spawns[i], undefined, true);
    });
  }

  /** Gatos esperando a cena da sala nova ficar pronta. */
  takePending(room: string): Pending[] {
    const list = this.pending.get(room) ?? [];
    this.pending.delete(room);
    return list;
  }

  private sceneKey(room: string) {
    return `Room@${room}`;
  }

  /** Põe o gato na sala (cria a cena se ninguém estava lá). */
  private enter(ps: PlayerState, room: string, enterFrom: DoorSide | undefined, bigMap = false) {
    const existing = this.scenes.get(room);
    if (existing && existing.sys.isActive()) {
      existing.addSlot(ps, enterFrom, bigMap);
      this.setViewer(ps.idx, existing);
      return;
    }
    const list = this.pending.get(room) ?? [];
    list.push({ ps, enterFrom, bigMap });
    this.pending.set(room, list);
    if (existing) return; // a cena ainda está começando
    const key = this.sceneKey(room);
    const scene = makeRoomScene!(key);
    this.scenes.set(room, scene);
    this.game.scene.add(key, scene, true, { run: this.run, room });
  }

  /** A cena da sala terminou de montar (chamado no fim do create): aponta a tela de quem entrou. */
  sceneReady(scene: RoomScene) {
    for (const s of scene.slots) this.setViewer(s.ps.idx, scene);
    scene.sys.setVisible(scene === this.localScene);
  }

  /** Quem vê o quê: o gato deste aparelho define a cena visível. */
  private setViewer(idx: number, scene: RoomScene) {
    if (idx === net.myIdx) {
      this.localScene = scene;
      for (const s of this.scenes.values()) if (s.sys.settings) s.sys.setVisible(s === scene);
    } else {
      session.host?.viewing.set(idx, scene);
    }
  }

  /** O gato passou pela porta: sai desta sala e entra na outra. */
  transfer(from: RoomScene, slot: Slot, to: string, enterFrom: DoorSide) {
    from.removeSlot(slot);
    if (slot.ps.idx === net.myIdx) this.localScene = undefined;
    else session.host?.viewing.delete(slot.ps.idx);
    this.closeIfEmpty(from);
    this.enter(slot.ps, to, enterFrom);
  }

  /** Sala sem ninguém (nem olhando): guarda o estado e fecha a cena. */
  private closeIfEmpty(scene: RoomScene) {
    if (scene.slots.length) return;
    if (this.localScene === scene) return;
    if (session.host && session.host.viewersIn(scene).length) return;
    scene.saveRoom();
    this.scenes.delete(scene.roomId);
    this.game.scene.remove(scene.sys.settings.key);
  }

  /** Um gato foi eliminado: atualiza as listas e vê se alguém venceu. */
  onDeath(idx: number) {
    const ps = this.run.players[idx];
    ps.alive = false;
    ps.outAt = this.run.vs!.elapsed;
    for (const s of this.scenes.values()) if (s.sys.isActive()) s.drawAliveList();
    this.checkWinner();
  }

  /** Jogador saiu da partida: o gato dele cai. */
  onLeft(idx: number) {
    for (const s of this.scenes.values()) {
      const slot = s.slots.find((x) => x.ps.idx === idx);
      if (slot?.player && !slot.player.dead) slot.player.kill();
    }
    const ps = this.run.players[idx];
    if (ps.alive) this.onDeath(idx);
  }

  private checkWinner() {
    if (this.finished) return;
    const alive = this.run.players.filter((p) => p.alive);
    if (alive.length > 1) return;
    this.finished = true;
    const winner = alive[0];
    for (const s of this.scenes.values()) if (s.sys.isActive()) s.showVsWinner(winner);
  }

  /** Quem já caiu assiste um gato vivo (segue ele de sala em sala). */
  private watching = new Map<number, number>();
  private watchLabels = new Map<number, Phaser.GameObjects.Text>();

  private sceneOf(idx: number) {
    for (const s of this.scenes.values()) if (s.sys.isActive() && s.slots.some((x) => x.ps.idx === idx)) return s;
    return undefined;
  }

  /** Botão de bomba/item de quem caiu: passa a assistir o próximo gato vivo. */
  nextSpectate(idx: number) {
    const alive = this.run.players.filter((p) => p.alive);
    if (!alive.length) return;
    const cur = this.watching.get(idx);
    const i = alive.findIndex((p) => p.idx === cur);
    this.watching.set(idx, alive[(i + 1) % alive.length].idx);
    this.updateSpectators();
  }

  private updateSpectators() {
    const board = this.run.vs!;
    const alive = this.run.players.filter((p) => p.alive);
    if (!alive.length) return;
    for (const ps of this.run.players) {
      if (ps.alive || session.host?.bots.has(ps.idx) || session.host?.gone.has(ps.idx)) continue;
      // Um instante para ver a própria queda
      if (board.elapsed - (ps.outAt ?? 0) < 2.5 && !this.watching.has(ps.idx)) continue;
      let t = this.watching.get(ps.idx);
      if (t === undefined || !this.run.players[t].alive) {
        // Prefere assistir uma pessoa (não um bot)
        t = (alive.find((p) => !session.host?.bots.has(p.idx)) ?? alive[0]).idx;
        this.watching.set(ps.idx, t);
      }
      const scene = this.sceneOf(t);
      if (!scene) continue;
      const cur = ps.idx === net.myIdx ? this.localScene : (session.host?.viewing.get(ps.idx) as RoomScene | undefined);
      const label = this.watchLabels.get(ps.idx);
      if (cur !== scene || !label?.active || label.scene !== scene || label.getData('t') !== t) {
        label?.destroy();
        this.setViewer(ps.idx, scene);
        if (cur && cur !== scene) this.closeIfEmpty(cur);
        this.watchLabels.set(ps.idx, scene.spectatorLabel(ps.idx, this.run.players[t].name).setData('t', t));
      }
    }
  }

  /** Segundos até o tabuleiro encolher de novo (undefined = já é 1x1). */
  nextShrinkIn(): number | undefined {
    const board = this.run.vs!;
    const next = board.stage + 1;
    if (next >= board.stages.length) return undefined;
    return stageTime(next) - board.elapsed;
  }

  /** A sala vai sumir na próxima redução e o alarme já tocou? */
  isDoomedSoon(def: RoomDef) {
    if (!this.warning) return false;
    const board = this.run.vs!;
    const next = board.stages[board.stage + 1];
    return !!next && !inRect(next, def.gx, def.gy);
  }

  private tick(dt: number) {
    const board = this.run.vs;
    if (!board || this.finished) return;
    this.updateSpectators();
    board.elapsed += dt;
    const left = this.nextShrinkIn();
    if (left === undefined) {
      this.warning = false;
      return;
    }
    this.warning = left <= SHRINK_WARNING;
    if (this.warning) {
      // Alarme a cada segundo durante o aviso
      const sec = Math.ceil(left);
      if (sec !== this.lastAlarm) {
        this.lastAlarm = sec;
        for (const s of this.scenes.values()) if (s.sys.isActive()) s.events.emit('sfx', 'alarm');
        if (sec === SHRINK_WARNING) for (const s of this.scenes.values()) if (s.sys.isActive()) s.showBanner('Alerta!', 'O mapa vai encolher em 10 segundos', '#ff5050');
      }
    }
    if (left <= 0) this.shrink();
  }

  /** Destrói as salas de fora do novo tamanho do tabuleiro. */
  private shrink() {
    const board = this.run.vs!;
    board.stage += 1;
    this.lastAlarm = -1;
    const rect = board.stages[board.stage];
    const floor = this.run.floor;
    const doomedRooms = Object.values(floor.rooms).filter((r) => !inRect(rect, r.gx, r.gy));
    // Gatos em salas que sumiram caem; a cena fica um instante para eles verem
    const doomedScenes: RoomScene[] = [];
    for (const r of doomedRooms) {
      const scene = this.scenes.get(r.id);
      if (scene) {
        scene.destroyRoom();
        doomedScenes.push(scene);
      }
      delete floor.rooms[r.id];
    }
    board.itemRooms = board.itemRooms.filter((id) => floor.rooms[id]);
    board.bossRooms = board.bossRooms.filter((id) => floor.rooms[id]);
    for (const s of this.scenes.values()) {
      if (!s.sys.isActive()) continue;
      if (!doomedScenes.includes(s)) s.refreshDoorsAfterShrink();
      s.events.emit('sfx', 'shrink');
      s.cameras.main.shake(400, 0.008);
    }
    // Depois de 2,5 s as cenas destruídas fecham; quem olhava passa a ver um gato vivo
    setTimeout(() => {
      for (const scene of doomedScenes) {
        const target = [...this.scenes.values()].find((s) => !doomedScenes.includes(s) && s.slots.some((x) => x.player && !x.player.dead));
        // Fim de jogo (ou ninguém para assistir): a sala fica na tela mostrando o resultado
        if (!target || this.finished) continue;
        for (const slot of [...scene.slots]) scene.removeSlot(slot);
        if (target) {
          if (this.localScene === scene) this.setViewer(net.myIdx, target);
          for (const idx of session.host?.viewersIn(scene) ?? []) this.setViewer(idx, target);
        }
        this.scenes.delete(scene.roomId);
        if (this.localScene === scene) this.localScene = target;
        this.game.scene.remove(scene.sys.settings.key);
      }
    }, 2500);
  }
}

export const vs: { director?: VsDirector } = {};

/**
 * Volta todo mundo para a sala de espera (fim de partida ou o anfitrião apertou "Sala").
 * Só quem hospeda chama.
 */
export function returnToLobby(game: Phaser.Game, autoStart = false) {
  vs.director?.dispose();
  vs.director = undefined;
  endSession();
  net.host?.broadcast({ t: 'tolobby' });
  for (const scene of [...game.scene.getScenes(false)]) {
    const key = scene.sys.settings.key;
    if (key.startsWith('Room@')) game.scene.remove(key);
    else if (key === 'Room') game.scene.stop(key);
  }
  game.scene.start('Lobby', { resume: true, autoStart });
}
