// ガチャの とくべつ消しゴムの とくせいが はたらくか、画面なしで ためす（確認用）
// 使い方: node scripts/test-special.mjs
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
// 2つを ならべて、shooter が 相手に向かって 弾く（止まるまで すすめる）
const shoot = (g, shooter, strength = 1, gap = 130) => {
  const me = g.erasers[shooter].body;
  const o = g.erasers[1 - shooter].body;
  Body.setPosition(me, { x: -gap / 2, y: 0 });
  Body.setPosition(o, { x: gap / 2, y: 0 });
  Body.setAngle(me, 0);
  Body.setAngle(o, 0);
  const dir = shooter === g.turnIndex ? (o.position.x - me.position.x) : 0;
  g.flick(shooter, dir, 0, strength);
  let ms = 0;
  while (g.phase === 'moving' || g.phase === 'settling') {
    g.step(PHYSICS.timeStep);
    ms += PHYSICS.timeStep;
    if (ms > 20000) break;
  }
};
const events = (g) => {
  const list = [];
  g.on('trait', (t) => list.push(t.type));
  g.on('flick', (f) => f.backfire && list.push('backfire'));
  return list;
};
let ok = 0;
let ng = 0;
const check = (name, cond, info = '') => {
  if (cond) ok++;
  else ng++;
  console.log(`${cond ? '○' : '×'} ${name} ${info}`);
};

// ニンジャケシ：当てられると よける
{
  const g = make('white-standard', 'ninjakeshi');
  const ev = events(g);
  const before = { ...g.erasers[1].body.position };
  shoot(g, 0);
  check('ニンジャケシ ドロン', ev.includes('dodge'), JSON.stringify(ev));
  check('ニンジャケシ 動いた（よけた）', Math.hypot(g.erasers[1].body.position.y - before.y, 0) > 5 || g.erasers[1].body.position.x !== 65);
}
// ユウレイケシ：すりぬける（あいては むこうまで進む）
{
  const g = make('white-standard', 'yureikeshi');
  const ev = events(g);
  shoot(g, 0, 0.6);
  check('ユウレイケシ すりぬけ', ev.includes('ghost'), JSON.stringify(ev));
  check('すりぬけた相手は ユウレイより むこうへ', g.erasers[0].body.position.x > 65 || !g.erasers[0].alive);
  check('番のあとで すりぬけが もどる', !g.erasers[1].ghost || g.erasers[1].ghostEnd);
}
// カガミン：はね返す
{
  const g = make('white-standard', 'kagamin');
  const ev = events(g);
  shoot(g, 0, 0.7);
  check('カガミン はねかえし', ev.includes('mirror'), JSON.stringify(ev));
  check('カガミンは 動かない', Math.abs(g.erasers[1].body.position.x - 65) < 3);
  check('当てたほうは もどされる', g.erasers[0].body.position.x < -65 || !g.erasers[0].alive);
}
// タマゴン：われて ほかの消しゴム
{
  const g = make('white-standard', 'tamagon');
  const ev = events(g);
  shoot(g, 0, 1);
  check('タマゴン パカッ', ev.includes('hatch') && g.erasers[1].def.id !== 'tamagon', g.erasers[1].def.name);
  check('から が ころがる', g.junk.some((j) => j.kind === 'shell'));
}
// キョウリュウ：しっぽ
{
  const g = make('kyoryu', 'white-standard');
  const ev = events(g);
  shoot(g, 0, 0.6);
  check('キョウリュウ しっぽ', ev.includes('tail'), JSON.stringify(ev));
}
// マッサラ：かどアタック（1回だけ）
{
  const g = make('massara', 'white-standard');
  const ev = events(g);
  shoot(g, 0, 0.6);
  check('マッサラ かどアタック', ev.includes('corner'));
  check('マッサラ 1回だけ', g.erasers[0].cornerUsed);
}
// ブロッケン：ブロック
{
  const g = make('blocken', 'white-standard');
  shoot(g, 0, 0.5, 200);
  check('ブロッケン ブロックが のこる', g.pencils.some((p) => p.look === 'block'));
}
// アイスケシ：こおり
{
  const g = make('icekeshi', 'white-standard');
  shoot(g, 0, 0.8, 300);
  check('アイスケシ こおりの道', g.waxZones.some((z) => z.kind === 'ice'), String(g.waxZones.length));
}
// ロケッター：ブースト
{
  const g = make('rocketter', 'white-standard');
  const ev = events(g);
  shoot(g, 0, 1, 300);
  check('ロケッター ブースト', ev.includes('boost'));
}
// ダイオウケシ：弾いたら つぎは ためる
{
  const g = make('daioukeshi', 'white-standard');
  const ev = events(g);
  shoot(g, 0, 0.3, 300);
  // あいての番
  if (g.phase === 'aim' && g.turnIndex === 1) {
    g.flick(1, 1, 0, 0.1);
    while (g.phase === 'moving') g.step(PHYSICS.timeStep);
  }
  check('ダイオウケシ ためる番', ev.includes('charge') && g.turnIndex === 1, `turn=${g.turnIndex}`);
}
// サイコロン：番のたびに 目がかわる
{
  const g = make('saikoron', 'white-standard', 'study', 1);
  const ev = events(g);
  g.flick(1, 1, 0, 0.1);
  while (g.phase === 'moving') g.step(PHYSICS.timeStep);
  check('サイコロン サイコロ', ev.includes('dice') && g.erasers[0].dice >= 1);
}
// クリアン：完全に 見えない
{
  const g = make('clear', 'white-standard');
  shoot(g, 0, 0.3, 300);
  const v = g.getState().erasers[0].trait;
  check('クリアン 見えない', v.clear && v.clearAlpha === 0);
}
// フルーツン：こんらんは 2わりだけ 反対
{
  let back = 0;
  for (let k = 0; k < 400; k++) {
    const g = make('white-standard', 'fruit');
    const ev = events(g);
    g.erasers[0].confused = true;
    g.flick(0, 1, 0, 1);
    if (ev.includes('backfire')) back++;
  }
  check('こんらん 反対は 2わりくらい', back > 50 && back < 115, `${back}/400`);
}
// ヒカルン：よるの教室で つよい
{
  const day = make('hikarun', 'white-standard', 'study').erasers[0];
  const night = make('hikarun', 'white-standard', 'night').erasers[0];
  check('ヒカルン よるは つよい', night.maxSpeed > day.maxSpeed && night.body.mass > day.body.mass);
}
// 書き出し→読みこみ で とくせいの じょうたいが のこる
{
  const g = make('kagamin', 'yureikeshi');
  g.erasers[0].defUsed = true;
  g.erasers[1].ghost = true;
  const st = JSON.parse(JSON.stringify(g.exportState()));
  const g2 = make('kagamin', 'yureikeshi');
  g2.importState(st);
  check('オンライン：守りを使ったこと・すりぬけ中', g2.erasers[0].defUsed && g2.erasers[1].ghost && g2.erasers[1].body.collisionFilter.mask === 0);
}
console.log(`\n${ok} ok / ${ng} ng`);
