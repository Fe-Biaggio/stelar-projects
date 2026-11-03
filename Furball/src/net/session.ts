import Phaser from 'phaser';
import { SfxName } from '../audio/sfx';
import { Facing } from '../objects/Player';
import { Run } from '../run';
import { BotBrain } from '../scenes/bot';
import { MirrorEncoder, Snap } from './mirror';
import { Msg, NetHost, net } from './peer';

// Partida multiplayer do lado de quem hospeda: comandos dos jogadores remotos, envio da imagem
// das salas (espelho) e, no VS, as várias salas rodando ao mesmo tempo.

/** Comandos que chegam de um jogador remoto. Ações contam apertos (não se perdem). */
export interface RemoteInput {
  mx: number;
  my: number;
  aim: Facing | null;
  fire: boolean;
  bomb: number;
  item: number;
  map: number;
  /** Toques/R fora do mapa (fim de partida: voltar à sala de espera). */
  tap?: number;
}

/** O que a sala precisa saber de cada tela remota (item usável e onde fica o mapa). */
export interface ViewerMeta {
  /** Frame do item usável (-1 = nenhum) e se está pronto. */
  a: [number, boolean];
  /** Retângulo do mapa (para o toque ampliar). */
  mb: [number, number, number, number];
  /** Está vivo (controles de toque aparecem). */
  alive: boolean;
}

/** Cena de sala que a sessão consegue mandar para os jogadores remotos. */
export interface MirroredScene extends Phaser.Scene {
  viewerMeta(idx: number): ViewerMeta | null;
}

const SEND_EVERY = 40; // ms entre pacotes (~25 por segundo)

export class HostSession {
  readonly encoder = new MirrorEncoder();
  /** Jogador (índice) de cada conexão. */
  readonly idxByPeer = new Map<string, number>();
  readonly inputs = new Map<number, RemoteInput>();
  private readonly used = new Map<number, { bomb: number; item: number; map: number; tap: number }>();
  /** Em que cena cada jogador remoto está olhando. */
  readonly viewing = new Map<number, Phaser.Scene>();
  private lastSend = new WeakMap<Phaser.Scene, number>();
  /** Saiu da partida (desconectou). */
  readonly gone = new Set<number>();
  /** Gatos comandados por bot (rodam aqui, em quem hospeda). */
  readonly bots = new Map<number, BotBrain>();

  constructor(
    readonly host: NetHost,
    readonly run: Run,
    peers: [string, number][],
    bots: number[] = [],
  ) {
    for (const [peer, idx] of peers) this.idxByPeer.set(peer, idx);
    for (const idx of bots) this.bots.set(idx, new BotBrain());
    host.on('msg', this.onMsg, this);
    host.on('leave', this.onLeave, this);
  }

  dispose() {
    this.host.off('msg', this.onMsg, this);
    this.host.off('leave', this.onLeave, this);
  }

  private onMsg(peer: string, msg: Msg) {
    const idx = this.idxByPeer.get(peer);
    if (idx === undefined) return;
    if (msg.t === 'in') this.inputs.set(idx, msg as unknown as RemoteInput);
  }

  private onLeave(peer: string) {
    const idx = this.idxByPeer.get(peer);
    if (idx === undefined) return;
    this.gone.add(idx);
    this.idxByPeer.delete(peer);
    this.inputs.delete(idx);
    this.viewing.delete(idx);
    this.encoder.resetViewer(idx);
    this.events.emit('left', idx);
  }

  /** Avisos para as salas (alguém saiu etc.). */
  readonly events = new Phaser.Events.EventEmitter();

  isRemote(idx: number) {
    return idx !== net.myIdx;
  }

  peerOf(idx: number) {
    for (const [peer, i] of this.idxByPeer) if (i === idx) return peer;
    return undefined;
  }

  input(idx: number): RemoteInput | undefined {
    return this.inputs.get(idx);
  }

  /** Ações apertadas desde a última vez (cada aperto vale uma vez). */
  takeActions(idx: number) {
    const inp = this.inputs.get(idx);
    const last = this.used.get(idx) ?? { bomb: inp?.bomb ?? 0, item: inp?.item ?? 0, map: inp?.map ?? 0, tap: inp?.tap ?? 0 };
    const out = {
      bomb: !!inp && inp.bomb > last.bomb,
      item: !!inp && inp.item > last.item,
      map: !!inp && inp.map > last.map,
      tap: !!inp && (inp.tap ?? 0) > last.tap,
    };
    if (inp) this.used.set(idx, { bomb: inp.bomb, item: inp.item, map: inp.map, tap: inp.tap ?? 0 });
    return out;
  }

  sendTo(idx: number, msg: Msg) {
    const peer = this.peerOf(idx);
    if (peer) this.host.send(peer, msg);
  }

  broadcast(msg: Msg) {
    this.host.broadcast(msg);
  }

  /** Jogadores remotos olhando esta cena. */
  viewersIn(scene: Phaser.Scene): number[] {
    const out: number[] = [];
    for (const [idx, s] of this.viewing) if (s === scene && !this.bots.has(idx)) out.push(idx);
    return out;
  }

  /** Manda a imagem da cena para quem está olhando (chamado no fim de cada quadro da sala). */
  pump(scene: MirroredScene, force = false) {
    const now = performance.now();
    if (!force && now - (this.lastSend.get(scene) ?? 0) < SEND_EVERY) return;
    this.lastSend.set(scene, now);
    const viewers = this.viewersIn(scene);
    if (!viewers.length) return;
    const snaps = this.encoder.encode(scene, viewers);
    for (const [idx, snap] of snaps) {
      // Pacotes grandes (a primeira imagem da sala) vão em pedaços de até ~12 KB
      let size = 0;
      let part: Snap['u'] = [];
      const parts: Snap['u'][] = [];
      for (const entry of snap.u) {
        const n = JSON.stringify(entry).length;
        if (size + n > 12_000 && part.length) {
          parts.push(part);
          part = [];
          size = 0;
        }
        part.push(entry);
        size += n;
      }
      for (const p of parts) this.sendTo(idx, { t: 'snap', s: { u: p, d: [], f: snap.f } });
      this.sendTo(idx, { t: 'snap', s: { ...snap, u: part }, m: scene.viewerMeta(idx) });
    }
  }

  sfx(scene: Phaser.Scene, name: SfxName) {
    for (const idx of this.viewersIn(scene)) this.sendTo(idx, { t: 'sfx', n: name });
  }

  shake(scene: Phaser.Scene, duration: number, intensity: number) {
    for (const idx of this.viewersIn(scene)) this.sendTo(idx, { t: 'shake', d: duration, i: intensity });
  }
}

/** Sessão multiplayer ativa (só em quem hospeda). */
export const session: { host?: HostSession } = {};

export function endSession() {
  session.host?.dispose();
  session.host = undefined;
}
