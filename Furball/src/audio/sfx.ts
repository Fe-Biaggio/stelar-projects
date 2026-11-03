import Phaser from 'phaser';
import { ZZFX, zzfx } from 'zzfx';

// Efeitos sonoros gerados na hora com a ZzFX (biblioteca pequena, sem arquivos de áudio).
// Os números são os parâmetros da ZzFX: volume, aleatoriedade, frequência, ataque, sustentação,
// soltura, forma, curva, deslize... (veja https://killedbyapixel.github.io/ZzFX/ para ajustar).

export type SfxName =
  | 'shoot'
  | 'hit'
  | 'enemyDie'
  | 'hurt'
  | 'die'
  | 'coin'
  | 'pickup'
  | 'heart'
  | 'item'
  | 'bombPlace'
  | 'explode'
  | 'door'
  | 'unlock'
  | 'locked'
  | 'chest'
  | 'alarm'
  | 'shrink'
  | 'victory'
  | 'defeat'
  | 'click'
  | 'boss'
  | 'meow'
  | 'power'
  | 'level'
  | 'join';

const SOUNDS: Record<SfxName, (number | undefined)[]> = {
  shoot: [0.35, 0.05, 520, 0.01, 0.02, 0.06, 0, 1.6, -6],
  hit: [0.4, 0.05, 210, 0, 0.02, 0.06, 4, 1, -8],
  enemyDie: [0.55, 0.1, 150, 0.01, 0.05, 0.22, 4, 1.5, -4, , , , , 1],
  hurt: [0.9, 0.05, 320, 0, 0.05, 0.2, 3, 1.4, -12, , , , , 1.2],
  die: [1, 0.05, 260, 0.02, 0.2, 0.6, 2, 1.2, -3, , -60, 0.15],
  coin: [0.5, 0, 1300, 0, 0.03, 0.15, 1, 1.5, , , 400, 0.05],
  pickup: [0.5, 0, 700, 0, 0.03, 0.12, 0, 1.4, , , 300, 0.04],
  heart: [0.5, 0, 600, 0.01, 0.06, 0.15, 0, 1.2, , , 200, 0.06],
  item: [0.6, 0, 523, 0.02, 0.15, 0.35, 0, 1.8, , , 262, 0.08, 0.1],
  bombPlace: [0.3, 0, 900, 0, 0.01, 0.05, 4, 1, , , , , , 0.5],
  explode: [1.4, 0.1, 60, 0.01, 0.2, 0.6, 4, 0.5, -1, , , , , 1.5, , 0.3],
  door: [0.4, 0, 180, 0.01, 0.06, 0.1, 1, 1, 8],
  unlock: [0.5, 0, 880, 0, 0.02, 0.1, 0, 1, , , 440, 0.04],
  locked: [0.4, 0, 120, 0, 0.04, 0.08, 3, 1],
  chest: [0.5, 0, 350, 0.01, 0.1, 0.2, 1, 1, 6, , 200, 0.05],
  alarm: [0.7, 0, 880, 0, 0.15, 0.05, 1, 1, , , -200, 0.08, 0.16],
  shrink: [1.2, 0.1, 50, 0.05, 0.4, 0.8, 4, 0.5, -0.5, , , , , 2, , 0.4],
  victory: [0.8, 0, 523, 0.05, 0.4, 0.6, 0, 1.5, , , 262, 0.12, 0.15],
  defeat: [0.8, 0, 220, 0.05, 0.3, 0.8, 2, 1, -2, , -50, 0.2],
  click: [0.25, 0, 700, 0, 0, 0.03, 0, 1],
  boss: [1, 0.1, 90, 0.05, 0.3, 0.4, 3, 2, -1, , , , , 1],
  meow: [0.4, 0.1, 700, 0.03, 0.1, 0.2, 0, 1.5, -3, 1],
  power: [0.6, 0, 300, 0.02, 0.2, 0.3, 0, 1, 10, , 150, 0.06],
  level: [0.6, 0, 400, 0.05, 0.2, 0.4, 0, 1, -6],
  join: [0.4, 0, 660, 0.01, 0.05, 0.1, 0, 1, , , 330, 0.05],
};

const lastPlayed = new Map<SfxName, number>();
let muted = false;

/** Toca um efeito agora (no aparelho de quem está jogando). */
export function playSfx(name: SfxName) {
  if (muted) return;
  const now = performance.now();
  // O mesmo som várias vezes no mesmo instante vira barulho: segura por 40 ms
  if (now - (lastPlayed.get(name) ?? -1e9) < 40) return;
  lastPlayed.set(name, now);
  try {
    zzfx(...SOUNDS[name]);
  } catch {
    // sem áudio no aparelho: segue sem som
  }
}

export function setMuted(m: boolean) {
  muted = m;
}

/** O navegador só libera o som depois de um toque/tecla: chame no primeiro input. */
export function unlockAudio() {
  try {
    if (ZZFX.audioContext.state !== 'running') void ZZFX.audioContext.resume();
  } catch {
    /* ignora */
  }
}

/**
 * Dentro das salas: avisa a cena (que toca para o jogador local e manda para os outros
 * jogadores que estão na mesma sala).
 */
export function sfx(scene: Phaser.Scene, name: SfxName) {
  scene.events.emit('sfx', name);
}

/** Libera o áudio no primeiro toque ou tecla do jogo. */
export function installAudioUnlock(game: Phaser.Game) {
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('gamepadconnected', unlock);
  void game;
}
