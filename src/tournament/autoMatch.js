// CPU どうしの試合を、画面なしで 一気に 計算する（トーナメントで 人が出ない試合）
// 少しずつ 計算して、画面が かたまらないようにする（runAutoMatchAsync）

import { Game } from '../logic/Game.js';
import { planCpuShot, planCpuCard, pickTarget, chooseCpuPiece } from '../ai/cpu.js';
import { findDesk } from '../config/desks.js';
import { findEraser } from '../config/erasers.js';
import { drawRandomCard } from '../config/cards.js';
import { GAME } from '../config/game.js';
import { PHYSICS } from '../config/physics.js';

const MAX_TURNS = 40;

/** 1試合を 最後まで すすめる（同期）。勝った人 0 か 1 */
function playOut(g) {
  const cfg = GAME.cpu.normal;
  let guard = 0;
  while (g.phase !== 'over' && g.turnCount < MAX_TURNS && guard++ < 200) {
    const shooter = g.turnIndex;
    for (let t = 0; t < 4 && g.phase === 'aim' && g.turnIndex === shooter; t++) {
      const c = planCpuCard(g, shooter, cfg);
      if (!c || !g.useCard(shooter, c).ok) break;
    }
    const run = () => {
      let ms = 0;
      while (g.phase === 'moving' || g.phase === 'settling' || g.phase === 'shrinking') {
        if (g.canSteer(shooter)) {
          const tg = pickTarget(g, shooter);
          if (tg) {
            const me = g.getState().erasers[shooter];
            g.steer(shooter, tg.t.x - me.x, tg.t.y - me.y);
          }
        }
        g.step(PHYSICS.timeStep);
        if ((ms += PHYSICS.timeStep) > 20000) break;
      }
    };
    run();
    if (g.phase !== 'aim' || g.turnIndex !== shooter) continue;
    chooseCpuPiece(g, shooter);
    const p = planCpuShot(g, shooter, cfg);
    g.flick(shooter, p.dirX, p.dirY, p.strength, p.spin);
    run();
  }
  const w = g.result?.winner;
  return w == null ? null : w;
}

/**
 * CPU どうしの試合。引き分け・長すぎるときは やりなおし（3回まで。それでも決まらなければ くじ）
 * @returns 0（a の勝ち）か 1（b の勝ち）
 */
export function runAutoMatch(deskId, eraserA, eraserB) {
  for (let k = 0; k < 3; k++) {
    const players = [eraserA, eraserB].map((id, i) => ({
      name: 'CPU' + i, type: 'cpu', level: 'normal', eraser: findEraser(id), color: '', card: drawRandomCard(),
    }));
    const g = new Game({ desk: findDesk(deskId), players, firstTurn: Math.floor(Math.random() * 2) });
    const w = playOut(g);
    if (w != null) return w;
  }
  return Math.random() < 0.5 ? 0 : 1;
}

/** 画面を かためないように、すこし待ってから 計算する */
export function runAutoMatchAsync(deskId, eraserA, eraserB) {
  return new Promise((resolve) => setTimeout(() => resolve(runAutoMatch(deskId, eraserA, eraserB)), 0));
}
