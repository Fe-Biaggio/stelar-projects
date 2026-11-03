import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { MenuItem, MenuList, askText, menuBackground, savedName } from '../ui/Menu';
import { drawRoom } from '../world/room';
import { recommendedSize } from '../world/vsfloor';
import { NetClient, NetHost, RoomInfo, browsePublicRooms, closeNet, net, privateId } from '../net/peer';
import { lobbyConfig } from './lobbyState';

// Telas do multiplayer: menu (criar / entrar), configurações da sala e lista de salas públicas.

/** Erros do PeerJS em português. */
export function netError(err: unknown): string {
  const type = (err as { type?: string })?.type;
  const msg = (err as Error)?.message;
  if (msg === 'full') return 'As 10 salas públicas estão ocupadas. Crie uma privada.';
  if (type === 'peer-unavailable') return 'Sala não encontrada. Confira o código.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'Sem conexão com o servidor. Verifique a internet.';
  if (msg === 'timeout') return 'Demorou demais para conectar. Tente de novo.';
  return 'Não foi possível conectar.';
}

/** Entra numa sala (pública ou pelo código) e vai para a sala de espera. */
export async function joinRoom(scene: Phaser.Scene, peerId: string) {
  closeNet();
  try {
    net.client = await NetClient.connect(peerId, { t: 'hello', name: savedName() });
    scene.scene.start('Lobby', {});
  } catch (err) {
    scene.scene.start('Multi', { msg: netError(err) });
  }
}

export class MultiScene extends Phaser.Scene {
  private menu?: MenuList;
  private status?: Phaser.GameObjects.Text;

  constructor() {
    super('Multi');
  }

  create(data: { msg?: string }) {
    closeNet();
    drawRoom(this);
    this.status = menuBackground(this, 'Multiplayer', data.msg ?? 'Jogue com amigos pela internet (celular, PC ou portátil)');
    if (data.msg) this.status.setColor('#ff8a70');
    const busy = (text: string) => {
      this.status?.setText(text).setColor('#f2c879');
      this.input.enabled = false;
    };
    const items: MenuItem[] = [
      { label: () => 'Criar sala', detail: () => 'Você hospeda: pública ou privada, co-op ou VS', action: () => this.scene.start('Create') },
      { label: () => 'Entrar em sala pública', detail: () => 'Lista das salas abertas', action: () => this.scene.start('Browse') },
      {
        label: () => 'Entrar com código',
        detail: () => 'Sala privada: peça o código para quem criou',
        action: () => {
          const code = askText('Código da sala (5 letras)', '', 5);
          if (!code) return;
          busy('Conectando…');
          void joinRoom(this, privateId(code));
        },
      },
      { label: () => 'Voltar', action: () => this.scene.start('Title', { mode: 'multi' }) },
    ];
    this.menu = new MenuList(this, items, GAME_WIDTH / 2, 190);
    this.menu.onBack = () => this.scene.start('Title', { mode: 'multi' });
    this.cameras.main.fadeIn(200);
  }

  update() {
    this.menu?.update();
  }
}

export class CreateScene extends Phaser.Scene {
  private menu?: MenuList;
  private status?: Phaser.GameObjects.Text;
  private creating = false;

  constructor() {
    super('Create');
  }

  create() {
    this.creating = false;
    drawRoom(this);
    this.status = menuBackground(this, 'Criar sala', 'Escolha como vai ser a partida');
    this.menu = new MenuList(this, this.items(), GAME_WIDTH / 2, 160, 560, 50, 9);
    this.menu.onBack = () => this.scene.start('Multi', {});
  }

  private items(): MenuItem[] {
    const c = lobbyConfig;
    const sizes = (d: number, axis: 'w' | 'h') => () => {
      c[axis] = Phaser.Math.Clamp(c[axis] + d, 1, 12);
    };
    const list: MenuItem[] = [
      {
        label: () => (c.isPublic ? 'Sala pública' : 'Sala privada'),
        detail: () => (c.isPublic ? 'Aparece na lista para qualquer um entrar' : 'Só entra quem tiver o código'),
        left: () => (c.isPublic = !c.isPublic),
        right: () => (c.isPublic = !c.isPublic),
      },
      {
        label: () => (c.mode === 'coop' ? 'Modo: Co-op (2 jogadores)' : 'Modo: VS (até 4 jogadores)'),
        detail: () => (c.mode === 'coop' ? 'Juntos contra os 5 níveis, sem fogo amigo' : 'Mapa grande que encolhe; o último gato vivo vence'),
        left: () => this.toggleMode(),
        right: () => this.toggleMode(),
      },
    ];
    if (c.mode === 'coop') {
      list.push({
        label: () => (c.sharedItems ? 'Itens: compartilhados' : 'Itens: individuais'),
        detail: () => (c.sharedItems ? 'O item pego vale para os dois gatos' : 'Cada um fica com o seu; o mapa tem 1,5x mais itens e drops'),
        left: () => (c.sharedItems = !c.sharedItems),
        right: () => (c.sharedItems = !c.sharedItems),
      });
    } else {
      list.push(
        {
          label: () => `Largura do mapa: ${c.w}`,
          detail: () => `Recomendado: 12x12 (4), 10x10 (3), 8x8 (2) · agora ${c.w}x${c.h}`,
          left: sizes(-1, 'w'),
          right: sizes(1, 'w'),
        },
        {
          label: () => `Altura do mapa: ${c.h}`,
          detail: () => (c.w * c.h <= 9 || Math.min(c.w, c.h) <= 2 ? 'Mapa pequeno: sem salas de item nem de boss' : ''),
          left: sizes(-1, 'h'),
          right: sizes(1, 'h'),
        },
        {
          label: () => 'Usar o recomendado',
          detail: () => 'Para 4 jogadores (12x12); dá para mudar na sala de espera',
          action: () => {
            c.w = c.h = recommendedSize(4);
          },
        },
      );
    }
    list.push(
      { label: () => 'Criar sala', detail: () => 'Abre a sala de espera', action: () => void this.createRoom() },
      { label: () => 'Voltar', action: () => this.scene.start('Multi', {}) },
    );
    return list;
  }

  private toggleMode() {
    lobbyConfig.mode = lobbyConfig.mode === 'coop' ? 'vs' : 'coop';
    // Recria as opções (cada modo tem as suas)
    this.time.delayedCall(0, () => this.menu?.setItems(this.items()));
  }

  private async createRoom() {
    if (this.creating) return;
    this.creating = true;
    this.status?.setText('Criando sala…').setColor('#f2c879');
    closeNet();
    try {
      net.host = await NetHost.create(lobbyConfig.isPublic);
      net.myIdx = 0;
      this.scene.start('Lobby', {});
    } catch (err) {
      this.creating = false;
      this.status?.setText(netError(err)).setColor('#ff8a70');
    }
  }

  update() {
    this.menu?.update();
  }
}

export class BrowseScene extends Phaser.Scene {
  private menu?: MenuList;
  private status?: Phaser.GameObjects.Text;
  private rooms: RoomInfo[] = [];
  private searching = false;

  constructor() {
    super('Browse');
  }

  create() {
    drawRoom(this);
    this.status = menuBackground(this, 'Salas públicas', '');
    this.menu = new MenuList(this, this.items(), GAME_WIDTH / 2, 150, 600, 44, 8);
    this.menu.onBack = () => this.scene.start('Multi', {});
    void this.search();
  }

  private items(): MenuItem[] {
    const list: MenuItem[] = this.rooms.map((r) => ({
      label: () => `Sala ${r.slot + 1} · ${r.mode === 'coop' ? 'Co-op' : 'VS'} · ${r.players}/${r.max} · ${r.host}`,
      disabled: () => r.started || r.players >= r.max,
      action: () => {
        this.status?.setText('Entrando…').setColor('#f2c879');
        void joinRoom(this, r.peerId);
      },
    }));
    list.push(
      { label: () => (this.searching ? 'Procurando…' : 'Atualizar'), action: () => void this.search() },
      { label: () => 'Voltar', action: () => this.scene.start('Multi', {}) },
    );
    return list;
  }

  private async search() {
    if (this.searching) return;
    this.searching = true;
    this.status?.setText('Procurando salas…').setColor('#f2c879');
    this.menu?.setItems(this.items());
    try {
      this.rooms = await browsePublicRooms();
      this.status
        ?.setText(this.rooms.length ? 'Escolha uma sala' : 'Nenhuma sala pública aberta agora. Crie uma!')
        .setColor('#b8a898');
    } catch (err) {
      this.rooms = [];
      this.status?.setText(netError(err)).setColor('#ff8a70');
    }
    this.searching = false;
    if (this.scene.isActive()) this.menu?.setItems(this.items());
  }

  update() {
    this.menu?.update();
  }
}
