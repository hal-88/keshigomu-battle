// ランダムマッチの レートを 画面なしで ためす
// 使い方: node scripts/test-rating.mjs
import { rating, tierOf, ratingLabel } from '../src/progress/rating.js';

let ok = 0;
let ng = 0;
const check = (name, cond, info = '') => {
  if (cond) ok++;
  else ng++;
  console.log(`${cond ? '○' : '×'} ${name} ${info}`);
};

check('はじめは 1000・ブロンズ', rating.get() === 1000 && tierOf(1000).id === 'bronze', ratingLabel(rating.get()));

// 同じ 強さの 相手に 勝つ
rating.begin('g1', 1000);
check('はじまった ときは 先に 負けで 計算（とちゅうで やめると 負け）', rating.get() < 1000, String(rating.get()));
const r1 = rating.finish('g1', 1);
check('勝ったら 上がる（はじめは 大きく +20）', r1 && r1.delta === 20 && rating.get() === 1020, JSON.stringify(r1));
check('同じ 試合は 2回 数えない', rating.finish('g1', 1) === null && rating.get() === 1020);

// とちゅうで やめた（finish が こない）→ 負けの まま
rating.begin('g2', 1000);
const afterQuit = rating.get();
check('やめたら 負けの まま', afterQuit < 1020, String(afterQuit));

// 強い 相手に 勝つと たくさん 上がる
rating.begin('g3', 1400);
const r3 = rating.finish('g3', 1);
check('強い 相手に 勝つと たくさん 上がる', r3.delta > 30, `+${r3.delta}`);

// 引き分け
const before = rating.get();
rating.begin('g4', before);
const r4 = rating.finish('g4', 0.5);
check('同じ 強さで 引き分けなら ほぼ そのまま', Math.abs(r4.delta) <= 1, String(r4.delta));

check('段位', tierOf(1099).id === 'bronze' && tierOf(1100).id === 'silver' && tierOf(1250).id === 'gold' && tierOf(1400).id === 'diamond' && tierOf(2000).id === 'master' && tierOf(2000).next === null);

// 段位が 上がる
let up = false;
for (let i = 0; i < 20 && !up; i++) {
  rating.begin('w' + i, rating.get());
  up = rating.finish('w' + i, 1).up;
}
check('勝ちつづけると 段位が 上がる', up, ratingLabel(rating.get()));

// 下がりすぎない
for (let i = 0; i < 200; i++) {
  rating.begin('l' + i, 100);
  rating.finish('l' + i, 0);
}
check('100より 下がらない', rating.get() >= 100, String(rating.get()));

console.log(`\n${ok} ok / ${ng} ng`);
