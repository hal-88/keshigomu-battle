// 2026-11-08 に ふやした能力カードが はたらくか、画面なしで ためす（確認用）
// 使い方: node scripts/test-cards.mjs
import Matter from 'matter-js';
import { Game } from '../src/logic/Game.js';
import { findDesk } from '../src/config/desks.js';
import { findEraser } from '../src/config/erasers.js';
import { findCard, CARDS } from '../src/config/cards.js';
import { PHYSICS } from '../src/config/physics.js';
import { planCpuCard } from '../src/ai/cpu.js';
import { GAME } from '../src/config/game.js';

const { Body } = Matter;
let ok = 0;
let ng = 0;
const check = (name, cond, info = '') => {
  if (cond) ok++;
  else ng++;
  console.log(`${cond ? '○' : '×'} ${name} ${info}`);
};

/** cardId を 1人目に くばった ゲーム */
const make = (cardId, n = 2, erasers = []) => {
  const players = Array.from({ length: n }, (_, i) => ({
    name: 'P' + i, type: 'cpu', eraser: findEraser(erasers[i] || 'white-standard'), color: '',
    card: i === 0 ? findCard(cardId) : findCard('hazure'),
  }));
  const g = new Game({ desk: findDesk('study'), players, firstTurn: 0 });
  const ev = [];
  for (const name of ['card', 'cardFx', 'newCard', 'turn', 'fall']) g.on(name, (d) => ev.push(name === 'cardFx' ? d.type : name));
  return { g, ev };
};
const put = (g, i, x, y) => {
  Body.setPosition(g.erasers[i].body, { x, y });
  Body.setAngle(g.erasers[i].body, 0);
};
const run = (g) => {
  let ms = 0;
  while (g.phase === 'moving' || g.phase === 'settling' || g.phase === 'shrinking') {
    g.step(PHYSICS.timeStep);
    if ((ms += PHYSICS.timeStep) > 20000) break;
  }
};
const flick = (g, i, dx, dy, s) => {
  g.flick(i, dx, dy, s);
  run(g);
};

// ためうち：このターンは おわり、つぎの自分の番は 2倍
{
  const { g, ev } = make('tameuchi');
  g.useCard(0, {});
  check('ためうち：ターンが すすむ', g.turnIndex === 1);
  flick(g, 1, 0, -1, 0.05);
  check('ためうち：つぎは 2倍', g.turnIndex === 0 && g.turn.powerMul === 2, ev.join(','));
}
// クッション：ふちで はね返る
{
  const { g, ev } = make('cushion');
  put(g, 0, 0, 150);
  put(g, 1, 250, -150);
  g.useCard(0, {});
  flick(g, 0, 0, 1, 0.7);
  check('クッション：落ちない', g.erasers[0].alive && ev.includes('cushion'), ev.join(','));
}
// つらぬき
{
  const { g, ev } = make('pierce');
  put(g, 0, -150, 0);
  put(g, 1, -60, 0);
  g.useCard(0, {});
  flick(g, 0, 1, 0, 0.6);
  check('つらぬき', ev.includes('pierce') && g.erasers[0].body.position.x > -60, `x=${g.erasers[0].body.position.x.toFixed(0)}`);
}
// ボウリング（3人）
{
  const { g, ev } = make('bowling', 3);
  put(g, 0, -200, 0);
  put(g, 1, -110, 0);
  put(g, 2, -20, 0);
  g.useCard(0, {});
  flick(g, 0, 1, 0, 0.7);
  check('ボウリング', ev.includes('bowling'), ev.join(','));
}
// とうめい：2ターン（クリアンは3ターン）
{
  const { g } = make('invisible');
  g.useCard(0, {});
  const v = g.getState().erasers[0].effects.invisible;
  flick(g, 0, 0, -1, 0.05);
  flick(g, 1, 0, 1, 0.05);
  const v2 = g.erasers[0].invisLeft;
  flick(g, 0, 0, -1, 0.05);
  flick(g, 1, 0, 1, 0.05);
  check('とうめい：2ターン', v && v2 === 1 && g.erasers[0].invisLeft === 0, `${v2} ${g.erasers[0].invisLeft}`);
  const c = make('invisible', 2, ['clear']).g;
  c.useCard(0, {});
  check('とうめい：クリアンは 3ターン', c.erasers[0].invisLeft === 3);
}
// ふでばこ：1回だけ ふせぐ
{
  const { g, ev } = make('pencase');
  put(g, 0, 0, 0);
  put(g, 1, 150, 0);
  g.useCard(0, {});
  flick(g, 0, 0, -1, 0.02);
  const p0 = { ...g.erasers[0].body.position };
  put(g, 1, p0.x + 150, p0.y);
  flick(g, 1, -1, 0, 0.8);
  const moved = Math.hypot(g.erasers[0].body.position.x - p0.x, g.erasers[0].body.position.y - p0.y);
  check('ふでばこ', ev.includes('shield') && moved < 6, `${ev.join(',')} moved=${moved.toFixed(1)}`);
}
// もういっかい：落ちても もどる
{
  const { g, ev } = make('extralife');
  put(g, 0, 0, 150);
  g.useCard(0, {});
  flick(g, 0, 0, 1, 1);
  check('もういっかい', g.erasers[0].alive && ev.includes('revive') && !g.erasers[0].extraLife, ev.join(','));
}
// けしくず：すべりにくい
{
  const { g } = make('crumbs');
  g.useCard(0, { x: 100, y: 0 });
  const z = g.waxZones.find((w) => w.kind === 'crumbs');
  put(g, 1, 100, 0);
  check('けしくず', z && g._localFriction(g.erasers[1]) > 2);
}
// さかさま
{
  const { g } = make('reverse');
  put(g, 0, 0, 100);
  put(g, 1, 0, -100);
  g.useCard(0, { target: 1 });
  flick(g, 0, -1, 0, 0.05);
  const before = g.erasers[1].body.position.x;
  g.flick(1, 1, 0, 0.4);
  run(g);
  check('さかさま：反対に とぶ', g.erasers[1].body.position.x < before - 20, `${before.toFixed(0)} → ${g.erasers[1].body.position.x.toFixed(0)}`);
}
// ちぢめビーム
{
  const { g } = make('shrinkbeam');
  g.useCard(0, { target: 1 });
  check('ちぢめビーム', g.erasers[1].size < 1 && g.erasers[1].sizeLeft === 2);
}
// カードどろぼう
{
  const players = [0, 1].map((i) => ({
    name: 'P' + i, type: 'cpu', eraser: findEraser('white-standard'), color: '',
    card: i === 0 ? findCard('thief') : findCard('fullpower'),
  }));
  const g = new Game({ desk: findDesk('study'), players, firstTurn: 0 });
  const r = g.useCard(0, { target: 1 });
  check('カードどろぼう', r.ok && g.players[0].card.def.id === 'fullpower' && !g.players[0].card.used && g.players[1].card.used);
}
// ジャンプ：相手を 飛びこえる
{
  const { g, ev } = make('jump');
  put(g, 0, -150, 0);
  put(g, 1, -80, 0);
  g.useCard(0, {});
  flick(g, 0, 1, 0, 0.55);
  check('ジャンプ', ev.includes('jump') && ev.includes('land') && g.erasers[0].body.position.x > -40 && Math.abs(g.erasers[1].body.position.x + 80) < 3,
    `me=${g.erasers[0].body.position.x.toFixed(0)} opp=${g.erasers[1].body.position.x.toFixed(0)}`);
}
// まんなかへ
{
  const { g } = make('center');
  put(g, 0, -250, 0);
  g.useCard(0, {});
  run(g);
  check('まんなかへ', g.erasers[0].body.position.x > -220 && g.phase === 'aim' && g.turnIndex === 0, `x=${g.erasers[0].body.position.x.toFixed(0)}`);
}
// まきもどし
{
  const { g } = make('rewind');
  check('まきもどし：さいしょは 使えない', !g.useCard(0, {}).ok);
  const start = { ...g.erasers[0].body.position };
  g.players[0].card.used = true;
  flick(g, 0, 1, 0, 0.3);
  flick(g, 1, 0, 1, 0.02);
  g.players[0].card = { def: findCard('rewind'), used: false };
  const r = g.useCard(0, {});
  check('まきもどし', r.ok && Math.hypot(g.erasers[0].body.position.x - start.x, g.erasers[0].body.position.y - start.y) < 1, r.reason || '');
}
// かたむき
{
  const { g } = make('tilt');
  g.useCard(0, {});
  check('かたむき', !!g.tilt && g.phase === 'settling');
  run(g);
}
// ていでん：つぎの人の ターンだけ
{
  const { g } = make('blackout');
  g.useCard(0, {});
  const now = g.isBlackout();
  flick(g, 0, 0, -1, 0.05);
  const next = g.isBlackout();
  flick(g, 1, 0, 1, 0.05);
  check('ていでん', !now && next && !g.isBlackout());
}
// ルーレット
{
  const { g, ev } = make('roulette');
  g.useCard(0, {});
  check('ルーレット', ev.includes('newCard') && g.canUseCard(0) && g.players[0].card.def.id !== 'roulette');
}
// シャッフル
{
  const { g } = make('shuffle', 3);
  const before = g.erasers.map((e) => ({ ...e.body.position }));
  g.useCard(0, {});
  run(g);
  const moved = g.erasers.filter((e, k) => Math.hypot(e.body.position.x - before[k].x, e.body.position.y - before[k].y) > 20).length;
  check('シャッフル', moved >= 2, `${moved}こ うごいた`);
}
// ブラックホール：まんなかの近くは すいこまれる
{
  const { g, ev } = make('blackhole');
  put(g, 1, 60, 0);
  put(g, 0, -260, 120);
  g.useCard(0, {});
  run(g);
  check('ブラックホール', !!g.blackHole && ev.includes('fall') && !g.erasers[1].alive, ev.join(','));
}
// せきがえ（CPU の ならべかた）
{
  const { g } = make('seating', 3);
  const plan = planCpuCard(g, 0, GAME.cpu.normal);
  const r = plan ? g.useCard(0, plan) : { ok: false, reason: 'no plan' };
  const st = g.getState();
  const myC = Math.hypot(st.erasers[0].x, st.erasers[0].y);
  check('せきがえ', r.ok && myC < 80, r.reason || `me=${myC.toFixed(0)}`);
}
// すべてのカードに ちゃんとした レア度
check('レア度', CARDS.every((c) => ['normal', 'rare', 'superrare', 'ultra', 'legend'].includes(c.rarity)), `${CARDS.length}まい`);
// 書き出し→読みこみ
{
  const { g } = make('blackhole');
  g.useCard(0, {});
  g.erasers[1].extraLife = true;
  g.erasers[0].invisLeft = 2;
  const st = JSON.parse(JSON.stringify(g.exportState()));
  const g2 = make('hazure').g;
  g2.importState(st);
  check('オンライン：カードの じょうたい', !!g2.blackHole && g2.erasers[1].extraLife && g2.erasers[0].invisLeft === 2);
}
console.log(`\n${ok} ok / ${ng} ng`);
