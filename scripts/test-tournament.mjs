// トーナメント表と CPU どうしの試合を、画面なしで ためす（確認用）
// 使い方: node scripts/test-tournament.mjs
import { makeBracket, setWinner, readyMatches, champion, spreadOrder, roundName, bracketSize, isOut, matchOf } from '../src/tournament/bracket.js';
import { runAutoMatch } from '../src/tournament/autoMatch.js';
import { REGULAR_ERASERS } from '../src/config/erasers.js';

let ok = 0;
let ng = 0;
const check = (name, cond, info = '') => {
  if (cond) ok++;
  else ng++;
  console.log(`${cond ? '○' : '×'} ${name} ${info}`);
};
const cpu = (k) => ({ name: 'CPU' + (k + 1), type: 'cpu', eraserId: REGULAR_ERASERS[k % REGULAR_ERASERS.length].id });
const human = (k) => ({ name: '人' + (k + 1), type: 'human', eraserId: 'white-standard' });

check('ちらばる順（8人）', JSON.stringify(spreadOrder(8)) === JSON.stringify([0, 4, 2, 6, 1, 5, 3, 7]), JSON.stringify(spreadOrder(8)));
check('大きさ', bracketSize(1) === 8 && bracketSize(8) === 8 && bracketSize(9) === 16 && bracketSize(16) === 16);
check('回戦の名前', roundName(8, 0) === '1回戦' && roundName(8, 1) === '準決勝' && roundName(16, 1) === '2回戦' && roundName(16, 3) === '決勝');

// 人が ちらばるか：8人制に 4人なら、1回戦で 人どうしは 当たらない（100回）
{
  let clash = 0;
  for (let t = 0; t < 100; t++) {
    const br = makeBracket([0, 1, 2, 3].map(human), cpu, 8);
    for (const m of br.rounds[0]) if (br.entries[m.a].type === 'human' && br.entries[m.b].type === 'human') clash++;
  }
  check('4人なら 1回戦で 人どうし 当たらない', clash === 0, `${clash}回`);
}
// 16人制に 9人：1回戦で 人どうしは 1試合だけ（9人なので どうしても1つ）
{
  let bad = 0;
  for (let t = 0; t < 100; t++) {
    const br = makeBracket([...Array(9)].map((_, k) => human(k)), cpu, 16);
    const clash = br.rounds[0].filter((m) => br.entries[m.a].type === 'human' && br.entries[m.b].type === 'human').length;
    if (clash !== 1) bad++;
  }
  check('9人なら 1回戦の 人どうしは 1試合だけ', bad === 0);
}
// ランダム：毎回 場所が かわる
{
  const seen = new Set();
  for (let t = 0; t < 30; t++) seen.add(makeBracket([human(0)], cpu, 8).entries.findIndex((e) => e.type === 'human'));
  check('1人の場所が ランダム', seen.size >= 4, `${seen.size}通り`);
}
// 最後まで すすめる（CPU どうしの試合で）
{
  const br = makeBracket([human(0)], cpu, 8);
  const me = br.entries.findIndex((e) => e.type === 'human');
  const t0 = Date.now();
  let guard = 0;
  while (champion(br) == null && guard++ < 20) {
    for (const { r, m, match } of readyMatches(br)) {
      const ea = br.entries[match.a];
      const eb = br.entries[match.b];
      const w = runAutoMatch(match.deskId, ea.eraserId, eb.eraserId);
      setWinner(br, r, m, w === 0 ? match.a : match.b);
    }
  }
  const ms = Date.now() - t0;
  check('優勝が きまる', champion(br) != null, `${ms}ms（7試合）`);
  check('負けた人は 試合なし', br.entries.every((_, i) => !isOut(br, i) || matchOf(br, i) == null));
  check('机が ランダム', new Set(br.rounds.flat().map((m) => m.deskId)).size >= 2);
  void me;
}
console.log(`\n${ok} ok / ${ng} ng`);
