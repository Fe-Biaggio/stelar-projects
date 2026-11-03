import Peer, { DataConnection } from 'peerjs';
import Phaser from 'phaser';

// Conexão entre aparelhos (WebRTC com PeerJS). Quem cria a sala hospeda a partida: roda o jogo
// e manda a imagem da sala para os outros, que mandam de volta os comandos (andar, atirar...).
// O servidor gratuito do PeerJS só apresenta os aparelhos; os dados vão direto entre eles.

const PREFIX = 'furball-v1-';
/** Salas públicas: até 10 ao mesmo tempo (endereços fixos que quem procura testa um a um). */
export const PUBLIC_SLOTS = 10;
export const publicId = (n: number) => `${PREFIX}pub-${n}`;
export const privateId = (code: string) => `${PREFIX}p-${code.toUpperCase()}`;

export type Msg = { t: string; [key: string]: unknown };

/** As mensagens viajam como texto JSON (o PeerJS divide as grandes em pedaços). */
function encode(msg: Msg) {
  return JSON.stringify(msg);
}

function decode(data: unknown): Msg {
  return (typeof data === 'string' ? JSON.parse(data) : data) as Msg;
}

/** Resumo de uma sala pública (lista de salas). */
export interface RoomInfo {
  peerId: string;
  slot: number;
  host: string;
  mode: 'coop' | 'vs';
  players: number;
  max: number;
  started: boolean;
}

const PEER_OPTIONS = { debug: 0 } as const;

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, PEER_OPTIONS) : new Peer(PEER_OPTIONS);
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new Error('timeout'));
    }, 10_000);
    const onError = (err: Error & { type?: string }) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    };
    peer.once('open', () => {
      clearTimeout(timer);
      // Depois de aberto, erros (ex.: alguém que saiu) não derrubam a conexão
      peer.off('error', onError);
      peer.on('error', () => undefined);
      resolve(peer);
    });
    peer.once('error', onError);
  });
}

function randomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

/**
 * Lado de quem hospeda. Eventos: 'join' (id), 'leave' (id), 'msg' (id, msg), 'ping' (id, ms).
 */
export class NetHost extends Phaser.Events.EventEmitter {
  readonly conns = new Map<string, DataConnection>();
  readonly pings = new Map<string, number>();
  /** Respostas para quem só está olhando a lista de salas. */
  info?: () => Omit<RoomInfo, 'peerId' | 'slot'>;
  private pingTimer?: number;
  /** Quem entra depois disso é recusado (sala cheia ou partida começada). */
  accept: (id: string) => string | null = () => null;

  private constructor(
    readonly peer: Peer,
    /** Código para entrar (privada) ou número da sala pública. */
    readonly code: string,
    readonly isPublic: boolean,
    readonly slot: number,
  ) {
    super();
    peer.on('connection', (conn) => this.onConnection(conn));
    peer.on('disconnected', () => {
      // Perdeu o servidor de apresentação: tenta voltar (quem já entrou continua conectado)
      if (!peer.destroyed) peer.reconnect();
    });
    this.pingTimer = window.setInterval(() => this.broadcast({ t: 'ping', s: performance.now() }), 1000);
  }

  static async create(isPublic: boolean): Promise<NetHost> {
    if (isPublic) {
      // Procura uma vaga livre entre as 10 salas públicas
      const order = Phaser.Utils.Array.Shuffle([...Array(PUBLIC_SLOTS).keys()]);
      for (const n of order) {
        try {
          const peer = await openPeer(publicId(n));
          return new NetHost(peer, String(n + 1), true, n);
        } catch (err) {
          if ((err as { type?: string }).type !== 'unavailable-id') throw err;
        }
      }
      throw new Error('full');
    }
    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      try {
        const peer = await openPeer(privateId(code));
        return new NetHost(peer, code, false, -1);
      } catch (err) {
        if ((err as { type?: string }).type !== 'unavailable-id') throw err;
      }
    }
    throw new Error('code');
  }

  private onConnection(conn: DataConnection) {
    conn.on('open', () => {
      conn.on('data', (data) => {
        const msg = decode(data);
        if (msg.t === 'info') {
          // Só olhando a lista: responde e fecha
          if (this.info) conn.send(encode({ t: 'info', ...this.info() }));
          setTimeout(() => conn.close(), 500);
          return;
        }
        if (msg.t === 'hello') {
          const refuse = this.accept(conn.peer);
          if (refuse) {
            conn.send(encode({ t: 'refused', why: refuse }));
            setTimeout(() => conn.close(), 500);
            return;
          }
          this.conns.set(conn.peer, conn);
          this.emit('join', conn.peer, msg);
          return;
        }
        if (!this.conns.has(conn.peer)) return;
        if (msg.t === 'pong') {
          const ms = Math.round(performance.now() - (msg.s as number));
          this.pings.set(conn.peer, ms);
          this.emit('ping', conn.peer, ms);
          return;
        }
        this.emit('msg', conn.peer, msg);
      });
      conn.on('close', () => this.drop(conn.peer));
      conn.on('error', () => this.drop(conn.peer));
    });
  }

  private drop(id: string) {
    if (!this.conns.delete(id)) return;
    this.pings.delete(id);
    this.emit('leave', id);
  }

  send(id: string, msg: Msg) {
    const c = this.conns.get(id);
    if (c?.open) c.send(encode(msg));
  }

  broadcast(msg: Msg) {
    const text = encode(msg);
    for (const c of this.conns.values()) if (c.open) c.send(text);
  }

  kick(id: string, why: string) {
    this.send(id, { t: 'refused', why });
    const c = this.conns.get(id);
    setTimeout(() => c?.close(), 300);
  }

  close() {
    window.clearInterval(this.pingTimer);
    this.broadcast({ t: 'closed' });
    setTimeout(() => this.peer.destroy(), 300);
    this.removeAllListeners();
  }
}

/** Lado de quem entra numa sala. Eventos: 'msg' (msg), 'close'. */
export class NetClient extends Phaser.Events.EventEmitter {
  private closed = false;
  /** Segura as mensagens enquanto a próxima tela monta (para não perder nenhuma). */
  private hold = false;
  private queue: Msg[] = [];

  private constructor(
    readonly peer: Peer,
    readonly conn: DataConnection,
  ) {
    super();
    conn.on('data', (data) => {
      const msg = decode(data);
      if (msg.t === 'ping') {
        conn.send(encode({ t: 'pong', s: msg.s }));
        return;
      }
      if (this.hold) this.queue.push(msg);
      else this.emit('msg', msg);
    });
    const end = () => {
      if (this.closed) return;
      this.closed = true;
      this.emit('close');
    };
    conn.on('close', end);
    conn.on('error', end);
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
  }

  /** Conecta numa sala (endereço PeerJS da sala). */
  static async connect(hostId: string, hello: Msg): Promise<NetClient> {
    const peer = await openPeer();
    return new Promise((resolve, reject) => {
      const conn = peer.connect(hostId, { reliable: true });
      const timer = setTimeout(() => {
        peer.destroy();
        reject(new Error('timeout'));
      }, 10_000);
      let opened = false;
      peer.on('error', (err: Error & { type?: string }) => {
        if (opened) return;
        clearTimeout(timer);
        peer.destroy();
        reject(err);
      });
      conn.on('open', () => {
        opened = true;
        clearTimeout(timer);
        conn.send(encode(hello));
        resolve(new NetClient(peer, conn));
      });
    });
  }

  send(msg: Msg) {
    if (this.conn.open) this.conn.send(encode(msg));
  }

  /** Começa a guardar as mensagens (troca de tela). */
  pause() {
    this.hold = true;
  }

  /** Entrega o que ficou guardado e volta ao normal. */
  release() {
    this.hold = false;
    const q = this.queue;
    this.queue = [];
    for (const m of q) this.emit('msg', m);
  }

  close() {
    this.closed = true;
    this.removeAllListeners();
    try {
      this.conn.close();
    } catch {
      /* já fechada */
    }
    setTimeout(() => this.peer.destroy(), 300);
  }
}

/** Procura as salas públicas abertas (testa os 10 endereços ao mesmo tempo). */
export async function browsePublicRooms(): Promise<RoomInfo[]> {
  const peer = await openPeer();
  const found: RoomInfo[] = [];
  await new Promise<void>((resolve) => {
    let pending = PUBLIC_SLOTS;
    const done = () => {
      if (--pending <= 0) resolve();
    };
    // Endereço sem sala: o PeerJS avisa com "peer-unavailable" no próprio peer
    const finishers = new Map<number, () => void>();
    peer.on('error', (err: Error) => {
      const m = /pub-(\d+)/.exec(err.message ?? '');
      if (m) finishers.get(Number(m[1]))?.();
    });
    for (let n = 0; n < PUBLIC_SLOTS; n++) {
      const conn = peer.connect(publicId(n), { reliable: true });
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        done();
      };
      const timer = setTimeout(finish, 5000);
      finishers.set(n, finish);
      conn.on('open', () => conn.send(encode({ t: 'info' })));
      conn.on('data', (data) => {
        const msg = decode(data);
        if (msg.t !== 'info') return;
        found.push({ ...(msg as unknown as RoomInfo), peerId: publicId(n), slot: n });
        clearTimeout(timer);
        conn.close();
        finish();
      });
      conn.on('error', finish);
    }
  });
  setTimeout(() => peer.destroy(), 500);
  return found.sort((a, b) => a.slot - b.slot);
}

/** A conexão atual (fica viva entre as cenas: lobby → partida → lobby). */
export const net: { host?: NetHost; client?: NetClient; myIdx: number } = { myIdx: 0 };

export function closeNet() {
  net.host?.close();
  net.client?.close();
  net.host = undefined;
  net.client = undefined;
  net.myIdx = 0;
}
