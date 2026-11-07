// 全力で弾いたとき、どれくらい飛ぶかを測る（調整用）: node scripts/distance.mjs
import Matter from 'matter-js';
import { Game } from '../src/logic/Game.js';
import { findDesk } from '../src/config/desks.js';
import { ERASERS } from '../src/config/erasers.js';
import { PHYSICS } from '../src/config/physics.js';

// ぶつからないように、相手は遠く（机の外）へ置いて測る
export function fullPowerDistance(eraser, deskId = 'giant') {
  const g = new Game({
    desk: findDesk(deskId),
    players: [
      { name: 'a', type: 'cpu', eraser },
      { name: 'b', type: 'cpu', eraser },
    ],
  });
  const b = g.erasers[0].body;
  Matter.Body.setPosition(b, { x: -600, y: 0 });
  Matter.Composite.remove(g.engine.world, g.erasers[1].body);
  g.erasers[1].alive = false; // 相手はいないことにする
  g.erasers[1].fall = { t: 1e9, x: 0, y: 0, angle: 0, vx: 0, vy: 0, av: 0 };
  g.flick(0, 1, 0, 1, 0);
  let ms = 0;
  while (b.speed > 0.01 && ms < 20000) {
    g.step(PHYSICS.timeStep);
    ms += PHYSICS.timeStep;
  }
  return b.position.x + 600;
}

if (process.argv[1]?.endsWith('distance.mjs')) {
  let sum = 0;
  for (const e of ERASERS) {
    const d = fullPowerDistance(e);
    sum += d;
    console.log(e.name.padEnd(12, '　'), Math.round(d));
  }
  console.log('平均', Math.round(sum / ERASERS.length), '（学習机のよこ幅は 640）');
}
