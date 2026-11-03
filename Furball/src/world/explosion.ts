import Phaser from 'phaser';

/** Efeito visual da explosão: clarão, bola de fogo, faíscas e fumaça. */
export function playExplosion(scene: Phaser.Scene, x: number, y: number) {
  const cy = y - 14;
  const depth = 26_000;

  // Clarão branco rápido
  const flash = scene.add.circle(x, cy, 40, 0xfff6d0, 0.9).setDepth(depth + 2);
  scene.tweens.add({ targets: flash, scale: 3, alpha: 0, duration: 160, onComplete: () => flash.destroy() });

  // Bola de fogo que cresce e some
  const fire = scene.add.circle(x, cy, 30, 0xff8a2a, 1).setDepth(depth + 1);
  const core = scene.add.circle(x, cy, 18, 0xffe066, 1).setDepth(depth + 1);
  scene.tweens.add({ targets: fire, scale: 3.2, alpha: 0, duration: 420, ease: 'Quad.Out', onComplete: () => fire.destroy() });
  scene.tweens.add({ targets: core, scale: 2.6, alpha: 0, duration: 300, ease: 'Quad.Out', onComplete: () => core.destroy() });

  // Faíscas e pedaços voando
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(50, 120);
    const p = scene.add
      .circle(x, cy, Phaser.Math.FloatBetween(2.5, 5), Phaser.Utils.Array.GetRandom([0xffd34a, 0xff8a2a, 0xff5030]))
      .setDepth(depth + 3);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * dist,
      y: cy + Math.sin(a) * dist * 0.7,
      alpha: 0,
      scale: 0.3,
      duration: Phaser.Math.Between(300, 550),
      ease: 'Quad.Out',
      onComplete: () => p.destroy(),
    });
  }

  // Fumaça subindo
  for (let i = 0; i < 8; i++) {
    const s = scene.add
      .circle(x + Phaser.Math.Between(-30, 30), cy + Phaser.Math.Between(-10, 20), Phaser.Math.Between(12, 22), 0x3a3432, 0.7)
      .setDepth(depth);
    scene.tweens.add({
      targets: s,
      y: s.y - Phaser.Math.Between(40, 80),
      scale: 1.8,
      alpha: 0,
      delay: 80,
      duration: Phaser.Math.Between(700, 1100),
      ease: 'Sine.Out',
      onComplete: () => s.destroy(),
    });
  }

  scene.cameras.main.shake(260, 0.012);
}

/** Marca de queimado no chão. Com o mesmo `seed`, desenha sempre a mesma marca. */
export function drawScorch(scene: Phaser.Scene, x: number, y: number, seed: string) {
  const rng = new Phaser.Math.RandomDataGenerator([seed]);
  const g = scene.add.graphics().setDepth(-60);
  // Borda mais clara, depois o centro bem escuro
  for (let i = 0; i < 7; i++) {
    g.fillStyle(0x1a0f0a, 0.25);
    g.fillEllipse(x + rng.between(-22, 22), y + rng.between(-10, 10), rng.between(70, 110), rng.between(34, 54));
  }
  for (let i = 0; i < 5; i++) {
    g.fillStyle(0x0c0705, 0.45);
    g.fillEllipse(x + rng.between(-14, 14), y + rng.between(-6, 6), rng.between(40, 70), rng.between(20, 34));
  }
  // Rachaduras saindo do centro
  g.lineStyle(2, 0x0a0503, 0.6);
  for (let i = 0; i < 7; i++) {
    const a = rng.realInRange(0, Math.PI * 2);
    const len = rng.between(28, 52);
    const mx = x + Math.cos(a + 0.2) * len * 0.5;
    const my = y + Math.sin(a + 0.2) * len * 0.25;
    g.lineBetween(x, y, mx, my);
    g.lineBetween(mx, my, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.5);
  }
  return g;
}
