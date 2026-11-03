import Phaser from 'phaser';
import { net } from '../net/peer';
import { session } from '../net/session';
import { BotBrain } from '../scenes/bot';
import { lobbyConfig } from '../scenes/lobbyState';
import { returnToLobby, vs } from '../scenes/vsDirector';
import type { RoomScene } from '../scenes/RoomScene';

// Só no modo dev (npm run dev): simula partidas VS só com bots (inclusive no lugar de quem
// hospeda) e procura gatos parados e salas em combate por tempo demais.
// Uso no console: await furballDev.simVs(4, 12, 12)

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SimResult {
  n: number;
  size: string;
  secs: number;
  finished: boolean;
  stage: string;
  alive: string[];
  deaths: string[];
  stuck: string[];
  longCombat: string[];
  maxCombat: number;
  scores: string[];
}

/**
 * `speed`: segundos de jogo somados ao relógio do VS a cada meio segundo (fora do aviso de
 * 10 s, que corre normal). `maxMs`: tempo máximo de verdade.
 */
export async function simVs(game: Phaser.Game, n: number, w: number, h: number, speed = 4, maxMs = 300_000): Promise<SimResult> {
  if (vs.director) {
    // Partida anterior (que passou do tempo) ainda aberta: encerra antes
    returnToLobby(game);
    await wait(500);
  }
  for (const s of game.scene.getScenes(true)) game.scene.stop(s.sys.settings.key);
  Object.assign(lobbyConfig, { mode: 'vs', w, h, isPublic: false });
  if (!net.host) {
    game.scene.start('Create');
    await wait(400);
    await (game.scene.getScene('Create') as unknown as { createRoom(): Promise<void> }).createRoom();
    await wait(600);
  } else {
    game.scene.start('Lobby', { resume: true });
    await wait(500);
  }
  const lobby = game.scene.getScene('Lobby') as unknown as { addBot(): void; removeBot(): void; startGame(): void };
  for (let i = 0; i < 4; i++) lobby.removeBot();
  for (let i = 1; i < n; i++) lobby.addBot();
  lobby.startGame();
  await wait(300);
  session.host!.bots.set(0, new BotBrain());
  const dir = vs.director!;
  const run = dir.run;
  const board = run.vs!;
  const t0 = performance.now();
  const hist: Record<number, { room: string; x: number; y: number; t: number; flag: boolean }> = {};
  const stuck: string[] = [];
  const deaths: string[] = [];
  const longCombat: string[] = [];
  const combatSince = new Map<RoomScene, number>();
  const alive = new Set(run.players.map((p) => p.idx));
  let maxCombat = 0;
  while (performance.now() - t0 < maxMs) {
    await wait(500);
    const now = performance.now();
    for (const p of run.players) {
      if (p.alive || !alive.has(p.idx)) continue;
      alive.delete(p.idx);
      deaths.push(`${p.name} @${p.room} etapa ${board.stage}${run.floor.rooms[p.room!] ? '' : ' (sala sumiu)'}`);
    }
    if ((dir as unknown as { finished: boolean }).finished) break;
    const left = dir.nextShrinkIn();
    if (left !== undefined && left > 12) board.elapsed += Math.min(speed, left - 12);
    for (const sc of dir.scenes.values()) {
      if (!sc.sys.isActive()) continue;
      const enemies = (sc as unknown as { enemies: { dead: boolean; kind: string; x: number; y: number }[] }).enemies;
      const fighting = enemies.some((e) => !e.dead) && sc.slots.some((s) => s.player && !s.player.dead);
      if (fighting) {
        if (!combatSince.has(sc)) combatSince.set(sc, now);
        const d = (now - combatSince.get(sc)!) / 1000;
        maxCombat = Math.max(maxCombat, d);
        if (d > 60 && !longCombat.some((x) => x.startsWith(sc.roomId))) {
          longCombat.push(`${sc.roomId} ${enemies.filter((e) => !e.dead).map((e) => `${e.kind}@${Math.round(e.x)},${Math.round(e.y)}`).join(' ')}`);
        }
      } else combatSince.delete(sc);
      for (const s of sc.slots) {
        const p = s.player;
        if (!p || p.dead) continue;
        const f = p.feet;
        const k = s.ps.idx;
        const hh = (hist[k] ??= { room: sc.roomId, x: f.x, y: f.y, t: now, flag: false });
        if (hh.room !== sc.roomId || Math.hypot(f.x - hh.x, f.y - hh.y) > 40) hist[k] = { room: sc.roomId, x: f.x, y: f.y, t: now, flag: false };
        else if (now - hh.t > 12_000 && !hh.flag) {
          hh.flag = true;
          stuck.push(`${s.ps.name} sala ${sc.roomId} (${Math.round(f.x)},${Math.round(f.y)})${fighting ? ' em combate' : ''}`);
        }
      }
    }
  }
  return {
    n,
    size: `${w}x${h}`,
    secs: Math.round((performance.now() - t0) / 1000),
    finished: (dir as unknown as { finished: boolean }).finished,
    stage: `${board.stage}/${board.stages.length - 1}`,
    alive: run.players.filter((p) => p.alive).map((p) => p.name),
    deaths,
    stuck,
    longCombat,
    maxCombat: Math.round(maxCombat),
    scores: run.players.map((p) => `${p.name}: ${p.score?.kills ?? 0}/${p.score?.items ?? 0}/${p.score?.bosses ?? 0}`),
  };
}
