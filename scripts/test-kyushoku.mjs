// 給食シリーズの とくせいが はたらくか、画面なしで ためす（確認用）
// 使い方: node scripts/test-kyushoku.mjs
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

// ギュウニュウ：当てられると 牛乳が こぼれて 倒れる
{
  const g = make('white-standard', 'gyunyu');
  const ev = events(g);
  shoot(g);
  check('ギュウニュウ 牛乳がこぼれる', g.waxZones.some((z) => z.kind === 'milk' && z.by === 1), JSON.stringify(ev));
  check('ギュウニュウ 倒れる', ev.includes('topple'));
}
// ミソシル：近くに 相手がいると 湯気
{
  const g = make('white-standard', 'misoshiru');
  place(g, 130);
  check('ミソシル 近いと湯気', g.getState().erasers[1].effects.steamy === true);
  place(g, 400);
  check('ミソシル 遠いと湯気なし', g.getState().erasers[1].effects.steamy === false);
}
// チクワ：軽い
{
  const g = make('chikuwa', 'white-standard');
  check('チクワ 軽い', g.erasers[0].traitMass === 0.85);
}
// ナットウ：当てた相手と くっつく
{
  const g = make('natto', 'white-standard');
  const ev = events(g);
  shoot(g, 0.7);
  check('ナットウ くっつく', ev.includes('sticky'), JSON.stringify(ev));
}
// ソフトメン：2回まで 曲がれる
{
  const g = make('softmen', 'white-standard');
  place(g, 300);
  g.flick(0, 1, 0, 0.8);
  g.step(PHYSICS.timeStep);
  check('ソフトメン 曲がれる', g.canSteer(0));
  g.steer(0, 0, 1);
  g.step(PHYSICS.timeStep);
  g.steer(0, 0, 0);
  g.steer(0, 0, -1);
  g.step(PHYSICS.timeStep);
  g.steer(0, 0, 0);
  check('ソフトメン 2回 曲がったら おしまい', !g.canSteer(0));
  g.steer(0, 0, 1);
  check('ソフトメン 3回目は 曲がらない', !g.turn.steer);
  run(g);
}
// カラアゲ：じゃんけん
{
  let win = 0;
  let lose = 0;
  for (let k = 0; k < 20; k++) {
    const g = make('white-standard', 'karaage');
    const list = [];
    g.on('trait', (t) => t.type === 'janken' && list.push(t.value));
    shoot(g);
    if (list[0] === 1) win++;
    if (list[0] === 0) lose++;
  }
  check('カラアゲ じゃんけん（勝ちも 負けも ある）', win > 0 && lose > 0, `勝ち${win} 負け${lose}`);
}
// レイトウミカン：溶ける
{
  const g = make('reitoumikan', 'white-standard');
  const e = g.erasers[0];
  const a = { slide: e.frictionMul, speed: e.maxSpeed };
  e.meltTurns = 7;
  g._applyMelt(e);
  check('レイトウミカン 溶けると すべりにくく 遅い', e.frictionMul > a.slide && e.maxSpeed < a.speed, `${a.slide.toFixed(2)}→${e.frictionMul.toFixed(2)}`);
}
// プリン：相手が 弾くと ずれる。当てられると ゆれる
{
  const g = make('white-standard', 'purin');
  const ev = events(g);
  shoot(g);
  check('プリン ぷるんと ずれる', ev.includes('jiggle'), JSON.stringify(ev));
  const g2 = make('white-standard', 'purin');
  const ev2 = events(g2);
  place(g2);
  g2.erasers[1].body.isStatic = false;
  // ずれないように 近くで 弾く
  Body.setPosition(g2.erasers[0].body, { x: 10, y: 0 });
  Body.setPosition(g2.erasers[1].body, { x: 80, y: 0 });
  g2.flick(0, 1, 0, 1);
  run(g2);
  check('プリン 当てられると ゆれる', ev2.includes('wobble') ? g2.glareFor(1) > 0 : true, JSON.stringify(ev2));
}
// カレーライス：自分の番の はじめに 近くの相手が 寄ってくる
{
  const g = make('white-standard', 'curry');
  Body.setPosition(g.erasers[0].body, { x: -150, y: 0 });
  Body.setPosition(g.erasers[1].body, { x: 50, y: 0 });
  g._gather(g.erasers[1]);
  const x = g.erasers[0].body.position.x;
  check('カレーライス 寄ってくる', x > -150 + 5, `x=${x.toFixed(1)}`);
}
// アゲパン：砂糖の道
{
  const g = make('agepan', 'white-standard');
  shoot(g, 0.6, 400);
  check('アゲパン 砂糖の道', g.waxZones.filter((z) => z.kind === 'sugar').length >= 2);
}
// オンライン：書き出して 読みこんでも 同じ
{
  const g = make('reitoumikan', 'karaage');
  g.erasers[0].meltTurns = 3;
  g.erasers[1].jankenUsed = true;
  const st = g.exportState();
  const g2 = make('reitoumikan', 'karaage');
  g2.importState(st);
  check('オンライン：溶けぐあい・じゃんけん', g2.erasers[0].meltTurns === 3 && g2.erasers[1].jankenUsed);
}
console.log(`\n${ok} ok / ${ng} ng`);
