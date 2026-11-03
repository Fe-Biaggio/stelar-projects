import Phaser from 'phaser';

// "Espelho" da sala: quem hospeda descreve tudo o que está desenhado na cena (imagens, textos,
// formas e desenhos) e manda só o que mudou; quem entrou recria igualzinho na própria tela.
// Assim o jogo inteiro roda num aparelho só e os outros veem exatamente a mesma coisa.

type Val = string | number | boolean | null;
export type ObjData = Val[];

/** Pacote de atualização: objetos novos/mudados, removidos e a ordem (quando muda). */
export interface Snap {
  u: [number, ObjData][];
  d: number[];
  o?: number[];
  /** Escurecimento da câmera (fade) de 0 a 1. */
  f: number;
}

type Owned = { __owner?: number; __local?: boolean };

const GO = Phaser.GameObjects;

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function shapeStyle(s: Phaser.GameObjects.Shape): Val[] {
  return [s.isFilled, s.fillColor, r2(s.fillAlpha), s.isStroked, s.strokeColor, r2(s.strokeAlpha), s.lineWidth, r2(s.originX), r2(s.originY)];
}

/** Resumo rápido de um desenho (Graphics) para saber se ele mudou. */
function hashBuffer(buf: unknown[]) {
  let h = buf.length;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    const n = typeof v === 'number' ? v : v ? 1 : 0;
    h = (h * 31 + Math.round(n * 1000)) | 0;
  }
  return h;
}

export class MirrorEncoder {
  private readonly ids = new WeakMap<object, number>();
  private next = 1;
  private readonly gfx = new WeakMap<object, { hash: number; json: Val[] }>();
  private readonly viewers = new Map<number, { sent: Map<number, string>; order: string }>();

  private idOf(obj: object) {
    let id = this.ids.get(obj);
    if (!id) {
      id = this.next++;
      this.ids.set(obj, id);
    }
    return id;
  }

  /** Quem entrou de novo nesta cena recebe tudo do zero. */
  resetViewer(viewer: number) {
    this.viewers.delete(viewer);
  }

  private serialize(obj: Phaser.GameObjects.GameObject, parent: number): ObjData | null {
    const o = obj as unknown as Phaser.GameObjects.Image;
    const common: Val[] = [
      parent,
      r2(o.x),
      r2(o.y),
      r2(o.scaleX),
      r2(o.scaleY),
      r2(o.rotation),
      r2(o.alpha),
      o.visible,
      o.depth,
      r2(o.scrollFactorX),
      o.blendMode as number,
    ];
    if (obj instanceof GO.Text) {
      return ['t', ...common, obj.text, JSON.stringify(obj.style.toJSON()), r2(obj.originX), r2(obj.originY), obj.lineSpacing];
    }
    if (obj instanceof GO.Image || obj instanceof GO.Sprite) {
      const im = obj as Phaser.GameObjects.Image;
      return [
        'i',
        ...common,
        im.texture.key,
        String(im.frame.name),
        r2(im.originX),
        r2(im.originY),
        im.flipX,
        im.flipY,
        im.tintFill,
        im.isTinted ? im.tintTopLeft : -1,
      ];
    }
    if (obj instanceof GO.Graphics) {
      const buf = obj.commandBuffer as unknown[];
      const hash = hashBuffer(buf);
      let cached = this.gfx.get(obj);
      if (!cached || cached.hash !== hash) {
        cached = { hash, json: buf.map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : (v as Val))) };
        this.gfx.set(obj, cached);
      }
      return ['g', ...common, hash, cached.json as unknown as Val];
    }
    if (obj instanceof GO.Rectangle) return ['r', ...common, r2(obj.width), r2(obj.height), ...shapeStyle(obj)];
    if (obj instanceof GO.Arc) {
      return ['a', ...common, r2(obj.radius), obj.startAngle, obj.endAngle, obj.anticlockwise, ...shapeStyle(obj)];
    }
    if (obj instanceof GO.Ellipse) return ['e', ...common, r2(obj.width), r2(obj.height), ...shapeStyle(obj)];
    if (obj instanceof GO.Triangle) {
      const t = obj.geom as Phaser.Geom.Triangle;
      return ['v', ...common, t.x1, t.y1, t.x2, t.y2, t.x3, t.y3, ...shapeStyle(obj)];
    }
    if (obj instanceof GO.Container) return ['k', ...common];
    return null;
  }

  /**
   * Monta o pacote de cada jogador remoto. Objetos com dono (HUD) só vão para o dono; os marcados
   * como locais (controles de toque de quem hospeda) não vão para ninguém.
   */
  encode(scene: Phaser.Scene, viewers: number[]): Map<number, Snap> {
    const entries: { id: number; owner?: number; data: ObjData; json: string }[] = [];
    const walk = (list: Phaser.GameObjects.GameObject[], parent: number, owner?: number) => {
      for (const obj of list) {
        const flags = obj as unknown as Owned;
        if (flags.__local || !obj.active) continue;
        const own = flags.__owner ?? owner;
        const data = this.serialize(obj, parent);
        if (!data) continue;
        const id = this.idOf(obj);
        // Desenhos grandes: compara pelo resumo em vez do conteúdo
        const json = data[0] === 'g' ? `g${data.slice(0, 13).join(',')}` : JSON.stringify(data);
        entries.push({ id, owner: own, data, json });
        if (obj instanceof GO.Container) walk(obj.list, id, own);
      }
    };
    walk(scene.children.list, 0);

    const fade = scene.cameras.main.fadeEffect as unknown as { isRunning: boolean; isComplete: boolean; alpha: number; direction: boolean };
    const f = fade.isRunning || fade.isComplete ? r2(fade.alpha) : 0;

    const out = new Map<number, Snap>();
    for (const v of viewers) {
      let state = this.viewers.get(v);
      if (!state) {
        state = { sent: new Map(), order: '' };
        this.viewers.set(v, state);
      }
      const mine = entries.filter((e) => e.owner === undefined || e.owner === v);
      const snap: Snap = { u: [], d: [], f };
      const alive = new Set<number>();
      for (const e of mine) {
        alive.add(e.id);
        if (state.sent.get(e.id) === e.json) continue;
        state.sent.set(e.id, e.json);
        snap.u.push([e.id, e.data]);
      }
      for (const id of state.sent.keys()) {
        if (!alive.has(id)) {
          snap.d.push(id);
          state.sent.delete(id);
        }
      }
      const order = mine.map((e) => e.id).join(',');
      if (order !== state.order) {
        state.order = order;
        snap.o = mine.map((e) => e.id);
      }
      out.set(v, snap);
    }
    return out;
  }
}

/** Recria na tela de quem entrou o que o anfitrião mandou. */
export class MirrorDecoder {
  private readonly objs = new Map<number, Phaser.GameObjects.GameObject>();
  private readonly styles = new Map<number, string>();
  private readonly gfxHash = new Map<number, number>();
  private readonly parents = new Map<number, number>();
  private readonly fadeRect: Phaser.GameObjects.Rectangle;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale.gameSize;
    this.fadeRect = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setDepth(1e9);
  }

  clear() {
    for (const o of this.objs.values()) if (o.scene) o.destroy();
    this.objs.clear();
    this.styles.clear();
    this.gfxHash.clear();
    this.parents.clear();
  }

  apply(snap: Snap) {
    for (const id of snap.d) {
      const o = this.objs.get(id);
      if (o?.scene) o.destroy();
      this.objs.delete(id);
      this.styles.delete(id);
      this.gfxHash.delete(id);
      this.parents.delete(id);
    }
    for (const [id, data] of snap.u) this.update(id, data);
    if (snap.o) this.reorder(snap.o);
    this.fadeRect.setFillStyle(0x000000, snap.f);
  }

  private create(type: string): Phaser.GameObjects.GameObject | null {
    const s = this.scene;
    switch (type) {
      case 't':
        return s.add.text(0, 0, '');
      case 'i':
        return s.add.image(0, 0, '__DEFAULT');
      case 'g':
        return s.add.graphics();
      case 'r':
        return s.add.rectangle(0, 0, 1, 1);
      case 'a':
        return s.add.circle(0, 0, 1);
      case 'e':
        return s.add.ellipse(0, 0, 1, 1);
      case 'v':
        return s.add.triangle(0, 0, 0, 0, 1, 0, 0, 1);
      case 'k':
        return s.add.container(0, 0);
      default:
        return null;
    }
  }

  private update(id: number, d: ObjData) {
    const type = d[0] as string;
    let obj = this.objs.get(id);
    if (!obj) {
      const created = this.create(type);
      if (!created) return;
      obj = created;
      this.objs.set(id, obj);
    }
    const parent = d[1] as number;
    if (this.parents.get(id) !== parent) {
      this.parents.set(id, parent);
      const container = parent ? (this.objs.get(parent) as Phaser.GameObjects.Container | undefined) : undefined;
      if (container) container.add(obj);
    }
    const o = obj as Phaser.GameObjects.Image;
    o.setPosition(d[2] as number, d[3] as number);
    o.setScale(d[4] as number, d[5] as number);
    o.setRotation(d[6] as number);
    o.setAlpha(d[7] as number);
    o.setVisible(d[8] as boolean);
    o.setDepth(d[9] as number);
    o.setScrollFactor(d[10] as number);
    o.setBlendMode(d[11] as number);
    const x = d.slice(12);
    switch (type) {
      case 't': {
        const t = obj as Phaser.GameObjects.Text;
        if (this.styles.get(id) !== x[1]) {
          this.styles.set(id, x[1] as string);
          t.setStyle(JSON.parse(x[1] as string));
        }
        if (t.text !== x[0]) t.setText(x[0] as string);
        t.setOrigin(x[2] as number, x[3] as number);
        t.setLineSpacing(x[4] as number);
        break;
      }
      case 'i': {
        const im = obj as Phaser.GameObjects.Image;
        const key = x[0] as string;
        if (im.texture.key !== key || String(im.frame.name) !== x[1]) {
          if (this.scene.textures.exists(key)) im.setTexture(key, x[1] as string);
        }
        im.setOrigin(x[2] as number, x[3] as number);
        im.setFlip(x[4] as boolean, x[5] as boolean);
        const tint = x[7] as number;
        if (tint < 0) im.clearTint();
        else if (x[6]) im.setTintFill(tint);
        else im.setTint(tint);
        break;
      }
      case 'g': {
        const g = obj as Phaser.GameObjects.Graphics;
        const hash = x[0] as number;
        if (this.gfxHash.get(id) !== hash) {
          this.gfxHash.set(id, hash);
          g.commandBuffer = (x[1] as unknown as unknown[]).slice();
        }
        break;
      }
      case 'r': {
        const r = obj as Phaser.GameObjects.Rectangle;
        if (r.width !== x[0] || r.height !== x[1]) r.setSize(x[0] as number, x[1] as number);
        this.applyShape(r, x.slice(2));
        break;
      }
      case 'a': {
        const a = obj as Phaser.GameObjects.Arc;
        if (a.radius !== x[0]) a.setRadius(x[0] as number);
        if (a.startAngle !== x[1]) a.setStartAngle(x[1] as number);
        if (a.endAngle !== x[2]) a.setEndAngle(x[2] as number);
        this.applyShape(a, x.slice(4));
        break;
      }
      case 'e': {
        const e = obj as Phaser.GameObjects.Ellipse;
        if (e.width !== x[0] || e.height !== x[1]) e.setSize(x[0] as number, x[1] as number);
        this.applyShape(e, x.slice(2));
        break;
      }
      case 'v': {
        const t = obj as Phaser.GameObjects.Triangle;
        t.setTo(x[0] as number, x[1] as number, x[2] as number, x[3] as number, x[4] as number, x[5] as number);
        this.applyShape(t, x.slice(6));
        break;
      }
    }
  }

  private applyShape(s: Phaser.GameObjects.Shape, v: Val[]) {
    if (v[0]) s.setFillStyle(v[1] as number, v[2] as number);
    else s.isFilled = false;
    if (v[3]) s.setStrokeStyle(v[6] as number, v[4] as number, v[5] as number);
    else s.isStroked = false;
    s.setOrigin(v[7] as number, v[8] as number);
  }

  /** Mesma ordem de desenho do anfitrião (para objetos de mesma profundidade). */
  private reorder(order: number[]) {
    for (const id of order) {
      const obj = this.objs.get(id);
      if (!obj) continue;
      const parent = this.parents.get(id);
      const container = parent ? (this.objs.get(parent) as Phaser.GameObjects.Container | undefined) : undefined;
      if (container) container.bringToTop(obj);
      else this.scene.children.bringToTop(obj);
    }
    this.scene.children.bringToTop(this.fadeRect);
  }
}
