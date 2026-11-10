// CPU どうしを画面なしで戦わせて、ターンの長さや勝ち方を調べる（調整用）
// 使い方: node scripts/sim.mjs [試合数] [机id か all] [人数] [1人目の消しゴムid（なければランダム）]
import { Game } from '../src/logic/Game.js';
import { planCpuShot, planCpuCard, pickTarget, chooseCpuPiece } from '../src/ai/cpu.js';
import { DESKS, findDesk } from '../src/config/desks.js';
import { ERASERS, findEraser } from '../src/config/erasers.js';
import { drawRandomCard } from '../src/config/cards.js';
import { GAME } from '../src/config/game.js';
import { PHYSICS } from '../src/config/physics.js';

const N = Number(process.argv[2] || 60);
const desks = process.argv[3] && process.argv[3] !== 'all' ? [findDesk(process.argv[3])] : DESKS;
const NP = Number(process.argv[4] || 2);
const firstId = process.argv[5];
const cfg = GAME.cpu.normal;
const S = {
  turns: [], moveMs: [], wins: {}, games: {}, draws: 0, selfFalls: 0, timeouts: 0,
  firstWins: 0, firstGames: 0, deskTurns: {},
  cards: {}, shrinks: 0, errors: 0, traits: {}, splits: 0, pieceFalls: 0,
};
const randomEraser = () => ERASERS[Math.floor(Math.random() * ERASERS.length)];

for (let m = 0; m < N; m++) {
  const desk = desks[m % desks.length];
  const ps = Array.from({ length: NP }, (_, k) => ({
    name: 'P' + k,
    type: 'cpu',
    eraser: k === 0 && firstId ? findEraser(firstId) : randomEraser(),
    color: '',
    card: drawRandomCard(),
  }));
  const firstTurn = Math.floor(Math.random() * NP); // ルーレットと同じく、さいしょの人はランダム
  const g = new Game({ desk, players: ps, firstTurn });
  for (const p of ps) S.games[p.eraser.name] = (S.games[p.eraser.name] || 0) + 1;
  if (m === 0) {
    const st = g.getState();
    for (let i = 0; i < NP; i++) for (let j = i + 1; j < NP; j++) {
      const a = st.erasers[i];
      const b = st.erasers[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < g.extentOf(i) + g.extentOf(j)) console.log('OVERLAP at start', desk.id, i, j, d.toFixed(0));
    }
  }
  let shooter = -1;
  g.on('fall', ({ playerIndex }) => { if (playerIndex === shooter && g.phase === 'moving') S.selfFalls++; });
  g.on('card', ({ card }) => { S.cards[card.id] = (S.cards[card.id] || 0) + 1; });
  g.on('shrink', () => S.shrinks++);
  g.on('split', () => S.splits++);
  g.on('pieceFall', () => S.pieceFalls++);
  g.on('trait', (t) => { S.traits[t.type] = (S.traits[t.type] || 0) + 1; });
  let guard = 0;
  try {
    while (g.phase !== 'over' && g.turnCount < 60 && guard++ < 300) {
      shooter = g.turnIndex;
      for (let t = 0; t < 4 && g.phase === 'aim'; t++) { // おかわりなら続けて
        const c = planCpuCard(g, shooter, cfg);
        if (!c) break;
        const id = g.players[shooter].card.def.id;
        const r = g.useCard(shooter, c);
        if (!r.ok) throw new Error('card failed ' + id + ' ' + r.reason);
      }
      let ms = 0;
      const run = () => {
        while (g.phase === 'moving' || g.phase === 'settling' || g.phase === 'shrinking') {
          if (g.canSteer(shooter) && !g.turn.curve?.brush) { // カーリンの ブラシは CPU は 使わない（本番と 同じ）
            const t = pickTarget(g, shooter);
            if (t) {
              const me = g.getState().erasers[shooter];
              g.steer(shooter, t.t.x - me.x, t.t.y - me.y);
            }
          }
          g.step(PHYSICS.timeStep);
          ms += PHYSICS.timeStep;
          if (ms > 20000) throw new Error('stuck ' + g.phase);
        }
      };
      run();
      if (g.phase !== 'aim' || g.turnIndex !== shooter) continue;
      chooseCpuPiece(g, shooter);
      const p = planCpuShot(g, shooter, cfg);
      g.flick(shooter, p.dirX, p.dirY, p.strength, p.spin);
      ms = 0;
      run();
      S.moveMs.push(ms);
      if (ms > PHYSICS.maxTurnMs) S.timeouts++;
    }
  } catch (err) {
    S.errors++;
    console.log('ERROR', desk.id, err.message, err.stack?.split('\n')[1]);
  }
  S.turns.push(g.turnCount);
  (S.deskTurns[desk.id] ||= []).push(g.turnCount);
  if (g.result?.winner != null) {
    S.firstGames++;
    if (g.result.winner === firstTurn) S.firstWins++;
  }
  if (g.phase === 'over' && g.result.ranking.length !== NP && g.result.winner != null) console.log('RANKING MISMATCH', g.result.ranking);
  if (g.result?.winner == null) S.draws++;
  else {
    const k = g.players[g.result.winner].eraser.name;
    S.wins[k] = (S.wins[k] || 0) + 1;
  }
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
const sorted = [...S.moveMs].sort((x, y) => x - y);
console.log('試合数', N, '平均ターン数', avg(S.turns), '最大', Math.max(...S.turns), 'エラー', S.errors);
console.log('動いている時間(ms) 平均', avg(S.moveMs), '中央', Math.round(sorted[sorted.length >> 1]), '最大', Math.round(sorted.at(-1)), 'タイムアウト', S.timeouts);
console.log('自滅', S.selfFalls, 'ひきわけ', S.draws, 'けずれた回数', S.shrinks);
console.log('先攻の勝率', Math.round((100 * S.firstWins) / Math.max(1, S.firstGames)) + '%', '机ごとの平均ターン', Object.fromEntries(Object.entries(S.deskTurns).map(([k, a]) => [k, avg(a)])));
console.log('とくせい', S.traits, '分裂', S.splits, 'かけらが落ちた', S.pieceFalls);
const rates = Object.entries(S.games)
  .map(([k, n]) => [k, Math.round((100 * (S.wins[k] || 0)) / n), n])
  .sort((a, b) => b[1] - a[1]);
console.log('勝率（高い順）');
for (const [k, r, n] of rates) console.log('  ' + k.padEnd(10, '　'), r + '%', `(${n}試合)`);
console.log('使われたカード', S.cards);
