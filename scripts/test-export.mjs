// オンライン用の「状態の保存・復元」を確かめる（調整用）: node scripts/test-export.mjs
// 1台で進めたゲームを書き出して、別のゲームに読みこみ、同じ状態になるかを見る
import { Game } from '../src/logic/Game.js';
import { DESKS } from '../src/config/desks.js';
import { findEraser, ERASERS } from '../src/config/erasers.js';
import { findCard, drawRandomCard } from '../src/config/cards.js';
import { PHYSICS } from '../src/config/physics.js';
import { planCpuShot, planCpuCard, chooseCpuPiece } from '../src/ai/cpu.js';
import { GAME } from '../src/config/game.js';

const mk = (a, b) =>
  new Game({
    desk: DESKS[0],
    players: [
      { name: 'a', type: 'human', eraser: findEraser(a), card: findCard('barrier') },
      { name: 'b', type: 'human', eraser: findEraser(b), card: findCard('wax') },
    ],
  });
const run = (g) => {
  while (g.phase === 'moving' || g.phase === 'settling' || g.phase === 'shrinking') g.step(PHYSICS.timeStep);
};

// 1) 書き出し → 読みこみ で同じになるか
const g = mk('pakatter', 'gardon');
g.useCard(0, { x: 0, y: -120, angle: 0.3 });
g.flick(0, 1, 0, 0.9, 0.4);
run(g);
const st = JSON.parse(JSON.stringify(g.exportState()));
const h = mk('pakatter', 'gardon');
h.importState(st);
const a = g.getState();
const b = h.getState();
let ok = a.turnIndex === b.turnIndex && a.pencils.length === b.pencils.length;
for (let i = 0; i < 2; i++) {
  ok &&= Math.abs(a.erasers[i].x - b.erasers[i].x) < 1e-6 && a.erasers[i].trait.covered === b.erasers[i].trait.covered;
}
console.log('書き出し→読みこみ で同じ:', ok);

// 2) ランダムな試合を、毎ターン書き出し→読みこみ しながら最後まで進めてエラーが出ないか
let errors = 0;
let games = 0;
for (let m = 0; m < 150; m++) {
  const ps = [0, 1, 2].map((k) => ({
    name: 'p' + k,
    type: 'human',
    eraser: ERASERS[Math.floor(Math.random() * ERASERS.length)],
    card: drawRandomCard(),
  }));
  let game = new Game({ desk: DESKS[m % DESKS.length], players: ps });
  try {
    for (let t = 0; t < 60 && game.phase !== 'over'; t++) {
      const me = game.turnIndex;
      for (let c = 0; c < 3 && game.phase === 'aim'; c++) {
        const params = planCpuCard(game, me, GAME.cpu.normal);
        if (!params || !game.useCard(me, params).ok) break;
        run(game);
      }
      if (game.phase === 'aim' && game.turnIndex === me) {
        chooseCpuPiece(game, me);
        const p = planCpuShot(game, me, GAME.cpu.normal);
        game.flick(me, p.dirX, p.dirY, p.strength, p.spin);
        run(game);
      }
      // 番が終わったら、べつの端末に送ったつもりで読みなおす
      const snap = JSON.parse(JSON.stringify(game.exportState()));
      const next = new Game({ desk: DESKS[m % DESKS.length], players: ps });
      next.importState(snap);
      game = next;
      // たまに通信切れで脱落
      if (Math.random() < 0.02 && game.phase !== 'over') game.eliminate(game.turnIndex);
    }
    games++;
  } catch (err) {
    errors++;
    console.log('ERROR', err.message, err.stack.split('\n')[1]);
  }
}
console.log('毎ターン読みなおす試合', games, 'エラー', errors);
