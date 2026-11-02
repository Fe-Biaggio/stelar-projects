// Gatos disponíveis. Os sprites são gerados por tools/extract_cats.py em public/assets/cat_<id>.png.

export type CatId = 'black' | 'orange' | 'siamese' | 'calico' | 'tuxedo' | 'gray';

/** Centro da boca no frame de 80x96: [x, y]. Precisa bater com MOUTHS em tools/extract_cats.py. */
interface MouthSpots {
  down: [number, number];
  left: [number, number];
  right: [number, number];
}

export interface CatInfo {
  id: CatId;
  name: string;
  mouth: MouthSpots;
}

export const CATS: Record<CatId, CatInfo> = {
  black: { id: 'black', name: 'Preto', mouth: { down: [40, 60], left: [17, 59], right: [63, 59] } },
  orange: { id: 'orange', name: 'Laranja', mouth: { down: [40, 60], left: [16, 60], right: [64, 60] } },
  siamese: { id: 'siamese', name: 'Siamês', mouth: { down: [40, 59], left: [16, 57], right: [64, 57] } },
  calico: { id: 'calico', name: 'Tricolor', mouth: { down: [40, 59], left: [14, 57], right: [64, 57] } },
  tuxedo: { id: 'tuxedo', name: 'Frajola', mouth: { down: [40, 54], left: [15, 52], right: [64, 52] } },
  gray: { id: 'gray', name: 'Rajado', mouth: { down: [40, 57], left: [14, 56], right: [65, 56] } },
};

/** Ordem na tela de seleção (o preto é o principal). */
export const PLAYABLE: CatId[] = ['black', 'orange', 'siamese', 'calico', 'tuxedo'];

export const CAT_FRAME_W = 80;
export const CAT_FRAME_H = 96;

export function loadCatSheets(scene: Phaser.Scene) {
  for (const id of Object.keys(CATS)) {
    scene.load.spritesheet(`cat_${id}`, `assets/cat_${id}.png`, {
      frameWidth: CAT_FRAME_W,
      frameHeight: CAT_FRAME_H,
    });
  }
}
