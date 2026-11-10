// 昔あそびシリーズの とくせいが はたらくか、画面なしで ためす（確認用）
// 使い方: node scripts/test-mukashi.mjs
import { Game } from '../src/logic/Game.js';
import { findDesk } from '../src/config/desks.js';
import { findEraser } from '../src/config/erasers.js';
import { PHYSICS } from '../src/config/physics.js';
import Matter from 'matter-js';

const { Body } = Matter;

const make = (a, b, desk = 'study', firstTurn = 0) => {
  const players = [a, b].map((id, i) => ({ name: 'P' + i, type: 'cpu', eraser: findEraser(id), color: '' }));
  return new Game({ desk: findDesk(desk), players, firstTurn });
};
const place = (g, gap = 130) => {
  Body.setPosition(g.erasers[0].body, { x: -gap / 2, y: 0 });
  Body.setPosition(g.erasers[1].body, { x: gap / 2, y: 0 });
  Body.setAngle(g.erasers[0].body, 0);
  Body.setAngle(g.erasers[1].body, 0);
};
const run = (g) => {
  let ms = 0;
  while (g.phase === 'moving' || g.phase === 'settling') {
    g.step(PHYSICS.timeStep);
    ms += PHYSICS.timeStep;
    if (ms > 20000) break;
  }
};
// 0番が 1番に向かって 弾く
const shoot = (g, strength = 1, gap = 130) => {
  place(g, gap);
  g.flick(0, 1, 0, strength);
  run(g);
};
const events = (g) => {
  const list = [];
  g.on('trait', (t) => list.push(t.type));
  g.on('stageFx', (t) => list.push('stage:' + t.type));
  return list;
};
let ok = 0;
let ng = 0;
const check = (name, cond, info = '') => {
  if (cond) ok++;
  else ng++;
  console.log(`${cond ? '○' : '×'} ${name} ${info}`);
};

// オテダマ：当てられても その場で 止まる（シロカクより 動かない）
{
  const g = make('white-standard', 'otedama');
  shoot(g);
  const g2 = make('white-standard', 'white-standard');
  shoot(g2);
  const a = g.erasers[1].body.position.x;
  const b = g2.erasers[1].body.position.x;
  check('オテダマ ポテッと 止まる', a < b, `${a.toFixed(0)} < ${b.toFixed(0)}`);
}
// コロビー：当てた相手を 強く はじく
{
  const g = make('korobee', 'white-standard');
  shoot(g, 0.6);
  const g2 = make('white-standard', 'white-standard');
  shoot(g2, 0.6);
  const a = g.erasers[1].alive ? g.erasers[1].body.position.x : 9999;
  const b = g2.erasers[1].alive ? g2.erasers[1].body.position.x : 9999;
  check('コロビー 強く はじく', a > b, `${a.toFixed(0)} > ${b.toFixed(0)}`);
}
// ハゴイタン：墨で ×
{
  const g = make('hagoitan', 'white-standard');
  const ev = events(g);
  shoot(g, 0.6);
  check('ハゴイタン 墨で ×', g.erasers[1].inked && g.getState().erasers[1].effects.inked, JSON.stringify(ev));
}
// カゼダコ：弱く 弾くと 遠くまで。風で 流される
{
  const g = make('kazedako', 'white-standard');
  place(g, 600);
  g.flick(0, 1, 0, 0.4);
  run(g);
  const kite = g.erasers[0].body.position.x;
  const g2 = make('white-standard', 'white-standard');
  place(g2, 600);
  g2.flick(0, 1, 0, 0.4);
  run(g2);
  const base = g2.erasers[0].body.position.x;
  check('カゼダコ ふわっと 遠くまで', kite > base + 10, `${kite.toFixed(0)} > ${base.toFixed(0)}`);
  const g3 = make('kazedako', 'white-standard');
  place(g3, 400);
  const p0 = { ...g3.erasers[0].body.position };
  g3._windDrift();
  const p1 = g3.erasers[0].body.position;
  check('カゼダコ 風で 流される', Math.hypot(p1.x - p0.x, p1.y - p0.y) > 5);
}
// コマワール：3回で 回転が 止まる
{
  const g = make('komawaru', 'white-standard');
  const ev = events(g);
  for (let k = 0; k < 4; k++) {
    place(g, 500);
    g.turnIndex = 0;
    g.phase = 'aim';
    g.turn = g._newTurn();
    g.flick(0, 1, 0, 0.3);
    run(g);
  }
  check('コマワール 回転が 止まる', ev.includes('topTired') && g.glareFor(0) > 0, JSON.stringify(ev));
}
// メンコン：ひっくり返す（相手は 次の番 お休み）
{
  const g = make('menkon', 'white-standard');
  const ev = events(g);
  shoot(g, 1, 90);
  check('メンコン ひっくり返す', ev.includes('menko') && (g.players[1].skipNext || g.turnIndex === 0 || !g.erasers[1].alive), JSON.stringify(ev));
}
// トンボン：手前の 消しゴムを 飛び越えて、奥の 相手に 当たる（相手が 1人だけなら 飛ばない）
{
  const players = ['tonbon', 'white-standard', 'white-standard'].map((id, i) => ({ name: 'P' + i, type: 'cpu', eraser: findEraser(id), color: '' }));
  const g = new Game({ desk: findDesk('study'), players, firstTurn: 0 });
  Body.setPosition(g.erasers[0].body, { x: -200, y: 0 });
  Body.setPosition(g.erasers[1].body, { x: -80, y: 0 });
  Body.setPosition(g.erasers[2].body, { x: 100, y: 0 });
  for (const e of g.erasers) Body.setAngle(e.body, 0);
  g.flick(0, 1, 0, 0.9);
  const flew = g.erasers[0].airborne;
  run(g);
  check('トンボン 手前を 飛び越える', flew && Math.abs(g.erasers[1].body.position.x + 80) < 8 && (!g.erasers[2].alive || g.erasers[2].body.position.x > 105), `flew=${flew} b=${g.erasers[1].body.position.x.toFixed(0)},${g.erasers[1].body.position.y.toFixed(0)} t=${g.erasers[2].alive ? g.erasers[2].body.position.x.toFixed(0) : 'FELL'}`);
  const g2 = make('tonbon', 'white-standard');
  place(g2, 200);
  g2.flick(0, 1, 0, 0.9);
  check('トンボン 相手が 1人なら ふつうに 当たる', !g2.erasers[0].airborne);
  run(g2);
}
// ケンダマン：2回ヒット
{
  const g = make('kendaman', 'white-standard');
  const ev = events(g);
  shoot(g, 0.6);
  check('ケンダマン 2回ヒット', ev.includes('kendama'), JSON.stringify(ev));
}
// ダルマン：段が 抜けて 飛ぶ
{
  const g = make('white-standard', 'daruman');
  const ev = events(g);
  const m0 = g.erasers[1].body.mass;
  shoot(g, 1, 90);
  check('ダルマン 段が 抜ける', ev.includes('darumaOff') && g.erasers[1].parts === 2 && g.junk.length >= 1, JSON.stringify(ev));
  check('ダルマン 軽くなる', g.erasers[1].body.mass < m0);
}
// ハジキング：回転なし
{
  const g = make('hajiking', 'white-standard');
  place(g, 400);
  g.flick(0, 1, 0, 0.7, 1);
  check('ハジキング 回転しない', Math.abs(g.erasers[0].body.angularVelocity) < 1e-6);
  run(g);
}
// オンライン：書き出して 読みこんでも 同じ
{
  const g = make('komawaru', 'menkon');
  g.erasers[0].topFlicks = 2;
  g.erasers[1].menkoUsed = true;
  g.erasers[1].inked = true;
  const st = g.exportState();
  const g2 = make('komawaru', 'menkon');
  g2.importState(st);
  check('オンライン：回転・めんこ・墨・風', g2.erasers[0].topFlicks === 2 && g2.erasers[1].menkoUsed && g2.erasers[1].inked && g2.wind.x === g.wind.x);
}
console.log(`\n${ok} ok / ${ng} ng`);
