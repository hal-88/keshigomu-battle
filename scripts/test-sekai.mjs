// 世界の遊びシリーズの とくせいが はたらくか、画面なしで ためす（確認用）
// 使い方: node scripts/test-sekai.mjs
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
const out = (g, i) => Body.setPosition(g.erasers[i].body, { x: 0, y: 2000 });
const drop = (g, i) => { Body.setPosition(g.erasers[i].body, { x: 0, y: 9999 }); g._checkFalls(); };

// ペタン：まんなかから 弾くと パワーアップ
{
  const g = make('petan', 'white-standard');
  const ev = events(g);
  Body.setPosition(g.erasers[0].body, { x: 0, y: 0 });
  Body.setPosition(g.erasers[1].body, { x: 0, y: 160 });
  g.flick(0, 1, 0, 0.5);
  check('ペタン まんなか ボーナス', ev.includes('petanque') && g.turn.powerMul > 1.2, JSON.stringify(ev));
  run(g);
}
// ケリハネ：1回だけ 落ちない
{
  const g = make('kerihane', 'white-standard');
  const ev = events(g);
  Body.setPosition(g.erasers[0].body, { x: 0, y: 300 });
  g._checkFalls();
  check('ケリハネ けり上げで もどる', g.erasers[0].alive && ev.includes('kickback'));
  Body.setPosition(g.erasers[0].body, { x: 0, y: 300 });
  g._checkFalls();
  check('ケリハネ 2回目は 落ちる', !g.erasers[0].alive);
}
// マンカラン：小石を 3つ
{
  const g = make('mancalan', 'white-standard');
  place(g, 600);
  Body.setPosition(g.erasers[1].body, { x: 0, y: 180 });
  g.flick(0, 1, 0, 0.8);
  run(g);
  const n = g.waxZones.filter((z) => z.kind === 'pebble').length;
  check('マンカラン 小石 3つ', n === 3, `小石${n}`);
}
// カバディン：2回 弾ける。2回目のあと もどる
{
  const g = make('kabaddin', 'white-standard');
  const ev = events(g);
  place(g, 500);
  g.flick(0, 1, 0, 0.4);
  run(g);
  const again = g.turnIndex === 0 && g.phase === 'aim';
  g.flick(0, 0, 1, 0.4);
  run(g);
  check('カバディン 2回 弾ける', again && ev.includes('kabaddi'), JSON.stringify(ev));
  check('カバディン 2回目の あと もどる', ev.includes('kabaddiBack') && g.turnIndex === 1);
}
// ナイトン：直角に 曲がる
{
  const g = make('naiton', 'white-standard');
  const ev = events(g);
  Body.setPosition(g.erasers[0].body, { x: -250, y: 0 });
  Body.setPosition(g.erasers[1].body, { x: 250, y: 150 });
  g.flick(0, 1, 0, 0.7, 0.5);
  run(g);
  const p = g.erasers[0].body.position;
  check('ナイトン L字に 曲がる', ev.includes('knight') && p.y > 40, `(${p.x.toFixed(0)},${p.y.toFixed(0)})`);
}
// カーリン：ブラシで のびる。弱いと 動かない
{
  const dist = (brush) => {
    const g = make('kaarin', 'white-standard');
    Body.setPosition(g.erasers[0].body, { x: -280, y: 0 });
    Body.setPosition(g.erasers[1].body, { x: 0, y: 180 });
    g.flick(0, 1, 0, 0.6);
    g.step(PHYSICS.timeStep);
    if (brush) g.steer(0, 1, 0);
    run(g);
    return g.erasers[0].alive ? g.erasers[0].body.position.x + 280 : 9999;
  };
  const a = dist(false);
  const b = dist(true);
  check('カーリン ブラシで のびる', b > a + 15, `${a.toFixed(0)} → ${b.toFixed(0)}`);
}
// ユンノ：番の はじめに 棒を 投げる
{
  const g = make('yunno', 'white-standard', 'study', 1);
  const ev = events(g);
  place(g, 300);
  g.flick(1, -1, 0, 0.3);
  run(g);
  check('ユンノ 棒を 投げる', ev.includes('yut') && g.erasers[0].yut >= 1 && g.erasers[0].yutPower > 0, JSON.stringify(ev));
}
// ブーメ：もどってくる
{
  const g = make('bume', 'white-standard');
  Body.setPosition(g.erasers[0].body, { x: -100, y: 0 });
  Body.setPosition(g.erasers[1].body, { x: 300, y: 190 });
  g.flick(0, 1, 0, 0.5, 0.3);
  let far = 0;
  let ms = 0;
  while (g.phase === 'moving' || g.phase === 'settling') {
    g.step(PHYSICS.timeStep);
    const p = g.erasers[0].body.position;
    far = Math.max(far, Math.hypot(p.x + 100, p.y));
    if ((ms += 16.7) > 20000) break;
  }
  const p = g.erasers[0].body.position;
  const back = Math.hypot(p.x + 100, p.y);
  check('ブーメ もどってくる', g.erasers[0].alive && back < far * 0.7, `いちばん遠く${far.toFixed(0)} 最後${back.toFixed(0)}`);
}
// ピニャ：割れて カード
{
  const g = make('white-standard', 'pinya');
  const ev = events(g);
  g.players[1].card = { def: g.players[1].card?.def, used: true };
  shoot(g, 1, 90);
  check('ピニャ 割れて カード', ev.includes('pinata') && g.erasers[1].pinataBroken && g.players[1].card && !g.players[1].card.used, JSON.stringify(ev));
}
// マトリョ：2回 復活して 小さくなる
{
  const g = make('matoryo', 'white-standard');
  const ev = events(g);
  drop(g, 0);
  const s1 = g.erasers[0].size;
  drop(g, 0);
  const alive2 = g.erasers[0].alive;
  drop(g, 0);
  check('マトリョ 2回 復活', alive2 && ev.filter((x) => x === 'doll').length === 2 && s1 < 1, `size ${s1}`);
  check('マトリョ 3回目は 落ちる', !g.erasers[0].alive);
}
// オンライン：書き出して 読みこんでも 同じ
{
  const g = make('matoryo', 'yunno');
  drop(g, 0);
  g.erasers[1].yut = 5;
  g.erasers[1].yutPower = 1.65;
  const st = g.exportState();
  const g2 = make('matoryo', 'yunno');
  g2.importState(st);
  check('オンライン：人形・ユンノの目', g2.erasers[0].dolls === 1 && Math.abs(g2.erasers[0].size - g.erasers[0].size) < 1e-6 && g2.erasers[1].yutPower === 1.65);
}
console.log(`\n${ok} ok / ${ng} ng`);
