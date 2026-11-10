// 名場面リプレイの 記録と 切りとりを、画面なしで ためす（動画を 作るところは ブラウザで）
// 使い方: node scripts/test-replay.mjs
import { Game } from '../src/logic/Game.js';
import { findDesk } from '../src/config/desks.js';
import { findEraser } from '../src/config/erasers.js';
import { PHYSICS } from '../src/config/physics.js';
import { createReplayRecorder } from '../src/replay/replay.js';
import { unpackView } from '../src/online/viewCodec.js';

let ok = 0;
let ng = 0;
const check = (name, cond, info = '') => {
  if (cond) ok++;
  else ng++;
  console.log(`${cond ? '○' : '×'} ${name} ${info}`);
};

const players = [0, 1].map((i) => ({ name: 'P' + i, type: 'human', eraser: findEraser('white-standard'), color: '' }));
const g = new Game({ desk: findDesk('study'), players, firstTurn: 0 });
const rec = createReplayRecorder();
let now = 0;
const cam = { x: 0, y: 0, zoom: 1 };
let ko = 0;
g.on('fall', ({ playerIndex }) => {
  ko++;
  rec.knockout(now, g.turnCount, { text: `P${g.turnIndex}が P${playerIndex}を 落とした！` });
});
let shots = 0;
while (g.phase !== 'over' && shots < 40) {
  if (g.phase === 'aim') {
    // 考えている 時間（5秒）→ 動画には 最後の 2秒だけ 残る
    for (let k = 0; k < 300; k++) {
      now += 16.7;
      rec.frame(now, g.getState(), null, cam);
    }
    const me = g.erasers[g.turnIndex].body.position;
    const o = g.erasers.find((e) => e.alive && e.playerIndex !== g.turnIndex).body.position;
    g.flick(g.turnIndex, o.x - me.x, o.y - me.y, 1);
    shots++;
    if (shots === 2) g.waxZones.push({ x: 0, y: 0, r: 30, scale: 0.5, owner: 0 }); // とちゅうで 机に ワックス
  }
  g.step(PHYSICS.timeStep);
  now += 16.7;
  rec.frame(now, g.getState(), null, cam);
}
for (let k = 0; k < 200; k++) {
  now += 16.7;
  rec.frame(now, g.getState(), null, cam);
}
const clips = rec.finish(now);
check('落ちたら クリップが できる', ko > 0 && clips.length > 0, `落ちた${ko} クリップ${clips.length}`);
const c = clips[0];
const dur = c.end - c.start;
const turnsIn = new Set(c.frames.map((f) => f.view.turnIndex)).size;
check('クリップは 4ターンぶんくらい（長すぎない）', dur > 2000 && dur < 32000, `${(dur / 1000).toFixed(1)}秒 コマ${c.frames.length}`);
check('ねらっている 時間は 2秒まで', (() => {
  let run = 0;
  let maxRun = 0;
  for (let i = 1; i < c.frames.length; i++) {
    if (c.frames[i].aimPhase && c.frames[i - 1].aimPhase) run += c.frames[i].t - c.frames[i - 1].t;
    else run = 0;
    maxRun = Math.max(maxRun, run);
  }
  return maxRun <= 2100;
})());
const st = unpackView(c.frames[c.frames.length - 1].view, c.base);
check('コマから 画面の 状態に もどせる', st.erasers.length === 2 && st.desk && st.players.length === 2, `番の人${turnsIn}種`);
check(
  '机の上の ものは その コマの 状態（最後の 状態に ならない）',
  c.frames[0].desk.waxZones.length === 0 && c.frames[c.frames.length - 1].desk.waxZones.length === 1,
);
console.log(`\n${ok} ok / ${ng} ng`);
