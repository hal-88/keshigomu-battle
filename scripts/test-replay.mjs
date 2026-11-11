// 試合の ふりかえりの 記録を、画面なしで ためす（見る 画面は ブラウザで）
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
  rec.knockout(now, { text: `P${playerIndex}が 落ちた` });
});
let shots = 0;
while (g.phase !== 'over' && shots < 40) {
  if (g.phase === 'aim') {
    // 考えている 時間（5秒）→ ふりかえりには 最後の 2秒だけ 残る
    for (let k = 0; k < 300; k++) {
      now += 16.7;
      rec.frame(now, g.getState(), null, cam);
    }
    const me = g.erasers[g.turnIndex].body.position;
    const o = g.erasers.find((e) => e.alive && e.playerIndex !== g.turnIndex).body.position;
    g.flick(g.turnIndex, o.x - me.x, o.y - me.y, shots === 0 ? 0.3 : 1);
    shots++;
    if (shots === 2) g.waxZones.push({ x: 0, y: 0, r: 30, scale: 0.5, owner: 0 }); // とちゅうで 机に ワックス
  }
  g.step(PHYSICS.timeStep);
  now += 16.7;
  rec.frame(now, g.getState(), null, cam);
}
const rp = rec.finish();
check('試合の はじめから 終わりまで 記録', !!rp && rp.frames[0].turn === 1 && rp.frames[rp.frames.length - 1].turn >= shots, `コマ${rp?.frames.length} 番${shots} 最初${rp.frames[0].turn} 最後${rp.frames[rp.frames.length - 1].turn}`);
const dur = rp.end - rp.start;
check('考えている 時間は つめてある（すきま なし）', rp.frames.every((f, i) => i === 0 || f.t - rp.frames[i - 1].t < 200), `${(dur / 1000).toFixed(1)}秒`);
check('落ちた しるし', ko > 0 && rp.marks.length === ko && rp.marks.every((m) => m.t >= rp.start && m.t <= rp.end + 50));
check('はじめの 机を おぼえている', !!rp.desk && rp.desk.shape.w === findDesk('study').shape.w);
const st = unpackView(rp.frames[rp.frames.length - 1].view, rp.base);
check('コマから 画面の 状態に もどせる', st.erasers.length === 2 && st.desk && st.players.length === 2);
check(
  '机の上の ものは その コマの 状態（最後の 状態に ならない）',
  rp.frames[0].desk.waxZones.length === 0 && rp.frames[rp.frames.length - 1].desk.waxZones.length === 1,
);
console.log(`\n${ok} ok / ${ng} ng`);
