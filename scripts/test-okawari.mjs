// おかわり：2枚とも いっしょに 使われるか、たくさん ためす（確認用）
// 使い方: node scripts/test-okawari.mjs
import { Game } from '../src/logic/Game.js';
import { findDesk } from '../src/config/desks.js';
import { findEraser } from '../src/config/erasers.js';
import { findCard } from '../src/config/cards.js';
import { PHYSICS } from '../src/config/physics.js';

let ok = 0;
let ng = 0;
const pairs = {};
for (let k = 0; k < 400; k++) {
  const n = 2 + (k % 3);
  const players = Array.from({ length: n }, (_, i) => ({ name: 'P' + i, type: 'cpu', eraser: findEraser('white-standard'), color: '' }));
  const g = new Game({ desk: findDesk('study'), players, firstTurn: 0 });
  g.players[0].card = { def: findCard('okawari'), used: false };
  const used = [];
  let drawn = [];
  g.on('card', (c) => used.push(c.card.id));
  g.on('newCard', (c) => (drawn = c.cards.map((x) => x.id)));
  const r = g.useCard(0, {});
  // 動いていたら 止まるまで
  let ms = 0;
  while (g.phase === 'settling' || g.phase === 'moving') {
    g.step(PHYSICS.timeStep);
    if ((ms += PHYSICS.timeStep) > 20000) break;
  }
  const p = g.players[0];
  const queued = p.card && !p.card.used ? [p.card.def.id, ...(p.cardQueue || []).map((c) => c.id)] : [];
  const applied = used.filter((id) => id !== 'okawari');
  const good = r.ok && drawn.length === 2 && drawn[0] !== drawn[1] && drawn.every((id) => applied.includes(id) || queued.includes(id) || id === 'rewind') && g.phase === 'aim';
  if (good) ok++;
  else {
    ng++;
    console.log('×', n, drawn, applied, queued, g.phase);
  }
  if (applied.length === 2) pairs.both = (pairs.both || 0) + 1;
}
console.log(`2枚とも その場で: ${pairs.both}/400`);
console.log(`\n${ok} ok / ${ng} ng`);
