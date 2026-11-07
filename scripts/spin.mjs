// 回転の様子を数字で見る（調整用）: node scripts/spin.mjs
// 1) 端をつかんで弾いたとき、何回転するか  2) 相手に当てたとき、当てられた側がどれだけ回るか
import { Game } from '../src/logic/Game.js';
import { DESKS } from '../src/config/desks.js';
import { findEraser } from '../src/config/erasers.js';
import Matter from 'matter-js';
import { PHYSICS } from '../src/config/physics.js';

const mk = (a, b) =>
  new Game({
    desk: DESKS[0],
    players: [
      { name: 'A', type: 'cpu', eraser: findEraser(a), color: '' },
      { name: 'B', type: 'cpu', eraser: findEraser(b), color: '' },
    ],
  });

function run(g) {
  let ms = 0;
  const rot = [0, 0];
  const prev = g.erasers.map((e) => e.body.angle);
  while (g.phase === 'moving' && ms < 20000) {
    g.step(PHYSICS.timeStep);
    ms += PHYSICS.timeStep;
    g.erasers.forEach((e, i) => {
      if (!e.alive) return;
      rot[i] += Math.abs(e.body.angle - prev[i]);
      prev[i] = e.body.angle;
    });
  }
  return { ms: Math.round(ms), a: (rot[0] / (2 * Math.PI)).toFixed(2), b: (rot[1] / (2 * Math.PI)).toFixed(2) };
}

for (const id of ['white-standard', 'fuwakaru', 'jumbo', 'hosokeshi']) {
  let g = mk(id, 'white-standard');
  g.flick(0, 0, -1, 0.7, 1); // 端をつかんで上へ（相手には当たらない）
  const self = run(g);
  g = mk(id, 'white-standard');
  Matter.Body.setPosition(g.erasers[1].body, { x: 0, y: 0 }); // 相手を近くに置く
  g.flick(0, 1, 0.1, 1, 0); // 全力で、相手の少し下側に当てる
  const hit = run(g);
  console.log(
    id.padEnd(15),
    `自分で回す: ${self.a}回転 ${self.ms}ms`,
    `| 当てた: 相手${hit.b}回転 自分${hit.a}回転 ${hit.ms}ms`,
  );
}
