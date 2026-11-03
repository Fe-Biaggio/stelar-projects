import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { CATS, CatId, PLAYABLE } from '../cats';
import { GAME_WIDTH } from '../config';
import { Msg, closeNet, net } from '../net/peer';
import { HostSession, session } from '../net/session';
import { Run, newCoopRun, newPlayer } from '../run';
import { MenuItem, MenuList, askText, menuBackground, saveName, savedName } from '../ui/Menu';
import { drawRoom } from '../world/room';
import { generateVsFloor } from '../world/vsfloor';
import { LobbyPlayer, LobbyView, isBot, lobbyConfig, lobbyPlayers, maxPlayers } from './lobbyState';
import { VsDirector, vs } from './vsDirector';

// Sala de espera: cada um escolhe o nome e o gato (sem repetir), vê o ping de todos e quem
// hospeda começa a partida quando todos estiverem prontos.

export class LobbyScene extends Phaser.Scene {
  private menu?: MenuList;
  private view?: LobbyView;
  private header?: Phaser.GameObjects.Text;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private lastBroadcast = 0;
  private starting = false;

  constructor() {
    super('Lobby');
  }

  private get isHost() {
    return !!net.host;
  }

  /** Meu jogador na lista. */
  private get me(): LobbyPlayer | undefined {
    const myId = this.isHost ? 'host' : net.client?.peer.id;
    return this.view?.players.find((p) => p.id === myId);
  }

  create(data: { resume?: boolean }) {
    this.starting = false;
    this.dynamic = [];
    drawRoom(this);
    this.header = menuBackground(this, 'Sala de espera', 'Conectando…');
    if (this.isHost) this.setupHost(!!data.resume);
    else if (net.client) this.setupClient();
    else {
      this.scene.start('Multi', {});
      return;
    }
    this.menu = new MenuList(this, this.items(), 715, 150, 440, 44, 8);
    this.menu.onBack = () => this.leave();
    this.render();
    this.cameras.main.fadeIn(200);
  }

  // ---------- Quem hospeda ----------

  private setupHost(resume: boolean) {
    const host = net.host!;
    if (!resume || !lobbyPlayers.length) {
      lobbyPlayers.length = 0;
      lobbyPlayers.push({ id: 'host', name: savedName(), cat: 'black', ping: 0 });
    } else {
      // Volta da partida: tira quem saiu no meio
      for (let i = lobbyPlayers.length - 1; i > 0; i--) if (!isBot(lobbyPlayers[i]) && !host.conns.has(lobbyPlayers[i].id)) lobbyPlayers.splice(i, 1);
    }
    host.accept = () => (this.starting ? 'A partida já começou' : lobbyPlayers.length >= maxPlayers(lobbyConfig.mode) ? 'A sala está cheia' : null);
    host.info = () => ({
      host: lobbyPlayers[0]?.name ?? '',
      mode: lobbyConfig.mode,
      players: lobbyPlayers.length,
      max: maxPlayers(lobbyConfig.mode),
      started: this.starting,
    });
    const onJoin = (id: string, msg: Msg) => {
      const taken = new Set(lobbyPlayers.map((p) => p.cat));
      const cat = PLAYABLE.find((c) => !taken.has(c)) ?? null;
      lobbyPlayers.push({ id, name: String(msg.name ?? 'Gato').slice(0, 12), cat, ping: 0 });
      playSfx('join');
      this.hostChanged();
    };
    const onLeave = (id: string) => {
      const i = lobbyPlayers.findIndex((p) => p.id === id);
      if (i > 0) lobbyPlayers.splice(i, 1);
      this.hostChanged();
    };
    const onMsg = (id: string, msg: Msg) => {
      const p = lobbyPlayers.find((x) => x.id === id);
      if (!p || msg.t !== 'set') return;
      if (typeof msg.name === 'string' && msg.name.trim()) p.name = msg.name.trim().slice(0, 12);
      const cat = msg.cat as CatId | undefined;
      if (cat && PLAYABLE.includes(cat) && !lobbyPlayers.some((x) => x !== p && x.cat === cat)) p.cat = cat;
      this.hostChanged();
    };
    const onPing = (id: string, ms: number) => {
      const p = lobbyPlayers.find((x) => x.id === id);
      if (p) p.ping = ms;
      if (performance.now() - this.lastBroadcast > 900) this.hostChanged();
    };
    host.on('join', onJoin);
    host.on('leave', onLeave);
    host.on('msg', onMsg);
    host.on('ping', onPing);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      host.off('join', onJoin);
      host.off('leave', onLeave);
      host.off('msg', onMsg);
      host.off('ping', onPing);
    });
    this.hostChanged();
  }

  /** Algo mudou: atualiza a tela e manda para todos. */
  private hostChanged() {
    const host = net.host;
    if (!host) return;
    this.view = {
      code: host.code,
      isPublic: host.isPublic,
      config: { ...lobbyConfig },
      players: lobbyPlayers.map((p) => ({ ...p })),
    };
    this.lastBroadcast = performance.now();
    host.broadcast({ t: 'lobby', s: this.view });
    this.render();
  }

  // ---------- Quem entrou ----------

  private setupClient() {
    const client = net.client!;
    const onMsg = (msg: Msg) => {
      if (msg.t === 'lobby') {
        this.view = msg.s as LobbyView;
        this.render();
      } else if (msg.t === 'start') {
        net.myIdx = msg.idx as number;
        client.pause(); // guarda as primeiras imagens até a tela do jogo montar
        this.scene.start('Mirror', { cats: msg.cats, mode: msg.mode });
      } else if (msg.t === 'refused') {
        closeNet();
        this.scene.start('Multi', { msg: String(msg.why) });
      } else if (msg.t === 'closed') {
        closeNet();
        this.scene.start('Multi', { msg: 'A sala foi fechada por quem hospedava.' });
      }
    };
    const onClose = () => this.scene.start('Multi', { msg: 'Conexão perdida.' });
    client.on('msg', onMsg);
    client.on('close', onClose);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      client.off('msg', onMsg);
      client.off('close', onClose);
    });
    client.release();
  }

  // ---------- Opções ----------

  private items(): MenuItem[] {
    const c = lobbyConfig;
    const list: MenuItem[] = [
      { label: () => `Gato: ${this.me?.cat ? CATS[this.me.cat].name : '—'}`, left: () => this.cycleCat(-1), right: () => this.cycleCat(1) },
      { label: () => `Nome: ${this.me?.name ?? savedName()}`, action: () => this.rename() },
    ];
    if (this.isHost && c.mode === 'coop') {
      list.push({
        label: () => (c.sharedItems ? 'Itens: compartilhados' : 'Itens: individuais'),
        left: () => this.setConfig(() => (c.sharedItems = !c.sharedItems)),
        right: () => this.setConfig(() => (c.sharedItems = !c.sharedItems)),
      });
    }
    if (this.isHost && c.mode === 'vs') {
      list.push(
        {
          label: () => `Largura: ${c.w}`,
          left: () => this.setConfig(() => (c.w = Math.max(1, c.w - 1))),
          right: () => this.setConfig(() => (c.w = Math.min(12, c.w + 1))),
        },
        {
          label: () => `Altura: ${c.h}`,
          left: () => this.setConfig(() => (c.h = Math.max(1, c.h - 1))),
          right: () => this.setConfig(() => (c.h = Math.min(12, c.h + 1))),
        },
      );
    }
    if (this.isHost) {
      list.push(
        {
          label: () => 'Adicionar bot',
          detail: () => 'Ocupa uma vaga e joga sozinho (com um gato livre)',
          disabled: () => lobbyPlayers.length >= maxPlayers(lobbyConfig.mode) || !this.freeCats().length,
          action: () => this.addBot(),
        },
        {
          label: () => 'Remover bot',
          disabled: () => !lobbyPlayers.some(isBot),
          action: () => this.removeBot(),
        },
      );
      list.push({
        label: () => 'Iniciar partida',
        detail: () => this.notReady() ?? 'Todos prontos!',
        disabled: () => !!this.notReady(),
        action: () => this.startGame(),
      });
    }
    list.push({ label: () => 'Sair da sala', action: () => this.leave() });
    return list;
  }

  private freeCats() {
    const taken = new Set(lobbyPlayers.map((p) => p.cat));
    return PLAYABLE.filter((c) => !taken.has(c));
  }

  /** Bot com um gato aleatório que ninguém escolheu. */
  private addBot() {
    const free = this.freeCats();
    if (!free.length || lobbyPlayers.length >= maxPlayers(lobbyConfig.mode)) return;
    let n = 1;
    while (lobbyPlayers.some((p) => p.id === `bot-${n}`)) n++;
    lobbyPlayers.push({ id: `bot-${n}`, name: `Bot ${n}`, cat: Phaser.Utils.Array.GetRandom(free), ping: 0 });
    playSfx('join');
    this.hostChanged();
  }

  private removeBot() {
    for (let i = lobbyPlayers.length - 1; i > 0; i--) {
      if (isBot(lobbyPlayers[i])) {
        lobbyPlayers.splice(i, 1);
        break;
      }
    }
    this.hostChanged();
  }

  private setConfig(f: () => void) {
    f();
    this.hostChanged();
  }

  /** Motivo para ainda não poder começar (ou undefined se pode). */
  private notReady(): string | undefined {
    const n = lobbyPlayers.length;
    if (lobbyConfig.mode === 'coop' && n < 2) return 'Esperando o outro jogador entrar…';
    if (lobbyConfig.mode === 'vs' && n < 2) return 'Precisa de pelo menos 2 jogadores';
    if (lobbyPlayers.some((p) => !p.cat)) return 'Todos precisam escolher um gato';
    return undefined;
  }

  private cycleCat(d: number) {
    const me = this.me;
    if (!me) return;
    const taken = new Set((this.view?.players ?? []).filter((p) => p !== me).map((p) => p.cat));
    const start = me.cat ? PLAYABLE.indexOf(me.cat) : -1;
    for (let i = 1; i <= PLAYABLE.length; i++) {
      const cat = PLAYABLE[(start + d * i + PLAYABLE.length * 10) % PLAYABLE.length];
      if (!taken.has(cat)) {
        this.chooseCat(cat);
        return;
      }
    }
  }

  private chooseCat(cat: CatId) {
    const me = this.me;
    if (!me || (this.view?.players ?? []).some((p) => p !== me && p.cat === cat)) return;
    if (this.isHost) {
      lobbyPlayers[0].cat = cat;
      this.hostChanged();
    } else {
      me.cat = cat; // mostra já; quem hospeda confirma
      net.client?.send({ t: 'set', cat });
      this.render();
    }
  }

  private rename() {
    const name = askText('Seu nome', this.me?.name ?? savedName(), 12);
    if (!name) return;
    saveName(name);
    if (this.isHost) {
      lobbyPlayers[0].name = name;
      this.hostChanged();
    } else {
      net.client?.send({ t: 'set', name });
      if (this.me) this.me.name = name;
      this.render();
    }
  }

  private leave() {
    closeNet();
    this.scene.start('Multi', {});
  }

  // ---------- Começar ----------

  private startGame() {
    if (this.notReady() || this.starting || !net.host) return;
    this.starting = true;
    const host = net.host;
    const players = lobbyPlayers.map((p) => ({ cat: p.cat!, name: p.name }));
    let run: Run;
    if (lobbyConfig.mode === 'coop') {
      run = newCoopRun(players, lobbyConfig.sharedItems);
    } else {
      const { floor, board } = generateVsFloor(lobbyConfig.w, lobbyConfig.h, players.length);
      run = {
        mode: 'vs',
        players: players.map((p, i) => {
          const ps = newPlayer(i, p.cat, p.name);
          ps.inventory.bombs = 1;
          ps.inventory.keys = 1;
          return ps;
        }),
        sharedItems: false,
        level: 1,
        floor,
        unlocked: [],
        cracked: [],
        rooms: {},
        vs: board,
      };
    }
    const peers: [string, number][] = [];
    const bots: number[] = [];
    lobbyPlayers.forEach((p, i) => {
      if (i === 0) return;
      if (isBot(p)) bots.push(i);
      else peers.push([p.id, i]);
    });
    session.host = new HostSession(host, run, peers, bots);
    net.myIdx = 0;
    const cats = players.map((p) => p.cat);
    for (const [id, idx] of peers) host.send(id, { t: 'start', idx, cats, mode: run.mode });
    playSfx('level');
    if (run.mode === 'coop') {
      this.scene.start('Room', { run });
      return;
    }
    const director = new VsDirector(this.game, run);
    vs.director = director;
    session.host.events.on('left', (idx: number) => director.onLeft(idx));
    this.scene.stop();
    director.start();
  }

  // ---------- Tela ----------

  private render() {
    if (!this.menu) return;
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const v = this.view;
    if (!v) return;
    const c = v.config;
    const where = v.isPublic ? `Sala pública ${v.code}` : `Sala privada · código ${v.code}`;
    const what =
      c.mode === 'coop'
        ? `Co-op · itens ${c.sharedItems ? 'compartilhados' : 'individuais'}`
        : `VS · mapa ${c.w}x${c.h}`;
    this.header?.setText(`${where}\n${what}`);

    // Jogadores
    const max = maxPlayers(c.mode);
    const myId = this.me?.id;
    for (let i = 0; i < max; i++) {
      const p = v.players[i];
      const y = 175 + i * 62;
      const bg = this.add.rectangle(260, y, 420, 54, 0x1a1412, 0.85).setStrokeStyle(2, p?.id === myId ? 0xf2c879 : 0x5a4a3c);
      this.dynamic.push(bg);
      if (!p) {
        this.dynamic.push(
          this.add.text(80, y, 'Esperando jogador…', { fontFamily: 'monospace', fontSize: '16px', color: '#6a5a4a' }).setOrigin(0, 0.5),
        );
        continue;
      }
      if (p.cat) this.dynamic.push(this.add.image(84, y + 4, `cat_${p.cat}`, 0).setScale(0.48));
      const tag = i === 0 ? ' (anfitrião)' : '';
      this.dynamic.push(
        this.add
          .text(120, y - 9, `${p.name}${tag}`, { fontFamily: 'monospace', fontSize: '17px', color: '#e8d9c4' })
          .setOrigin(0, 0.5),
        this.add
          .text(120, y + 13, p.cat ? CATS[p.cat].name : 'escolhendo o gato…', { fontFamily: 'monospace', fontSize: '12px', color: '#b8a898' })
          .setOrigin(0, 0.5),
      );
      const bot = isBot(p);
      const ping = i === 0 ? 'anfitrião' : bot ? 'bot' : `${p.ping} ms`;
      const color = i === 0 || bot ? '#8a7a6a' : p.ping < 80 ? '#7ad67a' : p.ping < 180 ? '#e2b13c' : '#ff6a50';
      this.dynamic.push(this.add.text(456, y, ping, { fontFamily: 'monospace', fontSize: '14px', color }).setOrigin(1, 0.5));
    }

    // Gatos: quem já foi escolhido fica apagado com o nome do dono
    const stripY = 175 + max * 62 + 34;
    PLAYABLE.forEach((cat, i) => {
      const x = 90 + i * 85;
      const owner = v.players.find((p) => p.cat === cat);
      const mine = owner && owner.id === myId;
      const img = this.add.image(x, stripY, `cat_${cat}`, 0).setScale(0.55).setAlpha(owner && !mine ? 0.3 : 1);
      if (mine) this.dynamic.push(this.add.circle(x, stripY + 4, 34, 0xf2c879, 0.25).setStrokeStyle(2, 0xf2c879));
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.chooseCat(cat));
      this.dynamic.push(img);
      this.dynamic.push(
        this.add
          .text(x, stripY + 42, owner ? owner.name : CATS[cat].name, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: owner ? (mine ? '#f2c879' : '#6a5a4a') : '#b8a898',
          })
          .setOrigin(0.5),
      );
    });
    this.menu.refresh();
  }

  update() {
    this.menu?.update();
    void GAME_WIDTH;
  }
}
