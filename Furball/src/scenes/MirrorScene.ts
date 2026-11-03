import Phaser from 'phaser';
import { SfxName, playSfx } from '../audio/sfx';
import { CatId } from '../cats';
import { GAME_WIDTH } from '../config';
import { createFurballTexture } from '../objects/Furball';
import { Facing } from '../objects/Player';
import { MirrorDecoder, Snap } from '../net/mirror';
import { Msg, closeNet, net } from '../net/peer';
import { ViewerMeta } from '../net/session';
import { BTN, PadInput } from '../ui/Gamepad';
import { TouchControls, isTouchDevice } from '../ui/TouchControls';

type MoveKeys = Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
type AimKeys = Record<Facing, Phaser.Input.Keyboard.Key>;

/**
 * Tela de quem entrou numa sala: mostra o que o anfitrião manda (a sala inteira, igualzinha) e
 * manda de volta os comandos deste aparelho.
 */
export class MirrorScene extends Phaser.Scene {
  private decoder!: MirrorDecoder;
  private touch?: TouchControls;
  private readonly pad = new PadInput();
  private moveKeys!: MoveKeys;
  private aimKeys!: AimKeys;
  private meta?: ViewerMeta;
  private counts = { bomb: 0, item: 0, map: 0, tap: 0 };
  private lastSent = '';
  private lastSendAt = 0;

  constructor() {
    super('Mirror');
  }

  create(data: { cats: CatId[] }) {
    this.counts = { bomb: 0, item: 0, map: 0, tap: 0 };
    this.lastSent = '';
    this.meta = undefined;
    for (const cat of data.cats ?? []) createFurballTexture(this, cat);
    this.decoder = new MirrorDecoder(this);
    if (this.game.renderer.type === Phaser.WEBGL) this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.3);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.moveKeys = kb.addKeys({ w: K.W, a: K.A, s: K.S, d: K.D }) as MoveKeys;
    this.aimKeys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT }) as AimKeys;
    kb.addCapture([K.UP, K.DOWN, K.LEFT, K.RIGHT, K.SPACE, K.TAB]);
    kb.on('keydown-E', () => this.counts.bomb++);
    kb.on('keydown-SPACE', () => this.counts.item++);
    kb.on('keydown-Q', () => this.counts.item++);
    kb.on('keydown-M', () => this.counts.map++);
    kb.on('keydown-TAB', () => this.counts.map++);
    kb.on('keydown-ESC', () => this.leave());

    if (isTouchDevice(this)) {
      this.touch = new TouchControls(
        this,
        () => this.counts.bomb++,
        () => this.counts.item++,
      );
    }
    // Toque no mapa (canto de cima à direita, ou o mapa grande) amplia/reduz
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const mb = this.meta?.mb;
      if (mb && mb[2] > 0 && p.x >= mb[0] && p.x <= mb[0] + mb[2] && p.y >= mb[1] && p.y <= mb[1] + mb[3]) this.counts.map++;
    });
    this.makeLeaveButton();

    const client = net.client;
    if (!client) {
      this.scene.start('Multi', {});
      return;
    }
    const onMsg = (msg: Msg) => this.onMsg(msg);
    const onClose = () => this.scene.start('Multi', { msg: 'Conexão perdida.' });
    client.on('msg', onMsg);
    client.on('close', onClose);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      client.off('msg', onMsg);
      client.off('close', onClose);
    });
    client.release();
  }

  private onMsg(msg: Msg) {
    switch (msg.t) {
      case 'snap':
        this.decoder.apply(msg.s as Snap);
        if (msg.m) this.applyMeta(msg.m as ViewerMeta);
        break;
      case 'sfx':
        playSfx(msg.n as SfxName);
        break;
      case 'shake':
        this.cameras.main.shake(msg.d as number, msg.i as number);
        break;
      case 'tolobby':
        net.client?.pause();
        this.scene.start('Lobby', {});
        break;
      case 'closed':
        closeNet();
        this.scene.start('Multi', { msg: 'A sala foi fechada por quem hospedava.' });
        break;
    }
  }

  private applyMeta(m: ViewerMeta) {
    this.meta = m;
    this.touch?.setActive(m.a[0] >= 0 ? m.a[0] : null, m.a[1]);
  }

  private makeLeaveButton() {
    const w = 132;
    const h = 34;
    const bg = this.add.graphics();
    bg.fillStyle(0x2a2220, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(2, 0x8a7a6a).strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const label = this.add.text(0, 0, '✕ Sair (Esc)', { fontFamily: 'monospace', fontSize: '14px', color: '#e8d9c4' }).setOrigin(0.5);
    const button = this.add.container(GAME_WIDTH - 86, 31, [bg, label]).setDepth(1e9 + 1).setSize(w, h);
    button.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.leave());
  }

  private leave() {
    closeNet();
    this.scene.start('Multi', {});
  }

  /** A seta pressionada por último manda. */
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

  update(time: number) {
    const k = this.moveKeys;
    let mx = (k.d.isDown ? 1 : 0) - (k.a.isDown ? 1 : 0);
    let my = (k.s.isDown ? 1 : 0) - (k.w.isDown ? 1 : 0);
    this.pad.poll();
    if (this.pad.used && this.touch) this.touch.hide();
    const pm = this.pad.move;
    if (pm.x || pm.y) {
      mx = pm.x;
      my = pm.y;
    }
    if (this.pad.bombPressed) this.counts.bomb++;
    if (this.pad.itemPressed) this.counts.item++;
    if (this.pad.mapPressed) this.counts.map++;
    if (this.pad.pressed(BTN.START)) this.leave();
    if (this.touch && this.touch.move.lengthSq() > 0) {
      mx = this.touch.move.x;
      my = this.touch.move.y;
    }
    const aim = this.currentAim() ?? this.pad.aim ?? this.touch?.aim ?? null;
    const input = {
      t: 'in',
      mx: Math.round(mx * 100) / 100,
      my: Math.round(my * 100) / 100,
      aim,
      fire: this.pad.fireHeld,
      ...this.counts,
    };
    const key = JSON.stringify(input);
    // Manda quando muda (e de vez em quando, para garantir)
    if (key !== this.lastSent || time - this.lastSendAt > 250) {
      this.lastSent = key;
      this.lastSendAt = time;
      net.client?.send(input);
    }
  }
}
