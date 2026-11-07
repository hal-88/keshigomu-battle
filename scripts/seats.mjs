// はじめの席が、重なっていないか・ふちに近すぎないかを、机と人数ごとに調べる（調整用）
// 使い方: node scripts/seats.mjs
import { Game } from '../src/logic/Game.js';
import { DESKS } from '../src/config/desks.js';
import { ERASERS } from '../src/config/erasers.js';
import { edgeClearance } from '../src/logic/geometry.js';

const big = [...ERASERS].sort((a, b) => b.shape.w * (b.shape.h || 1) - a.shape.w * (a.shape.h || 1))[0];
for (const desk of DESKS) {
  for (let n = 2; n <= 4; n++) {
    const players = Array.from({ length: n }, (_, i) => ({ name: 'P' + i, type: 'cpu', eraser: big, color: '' }));
    const g = new Game({ desk, players });
    const st = g.getState();
    let minGap = Infinity;
    let minEdge = Infinity;
    st.erasers.forEach((a, i) => {
      minEdge = Math.min(minEdge, edgeClearance(desk, a.x, a.y) - g.extentOf(i));
      st.erasers.forEach((b, j) => {
        if (j > i) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y) - g.extentOf(i) - g.extentOf(j));
      });
    });
    const seats = st.erasers.map((e) => `(${Math.round(e.x)},${Math.round(e.y)})`).join(' ');
    const warn = minGap < 20 || minEdge < 15 ? ' ⚠' : '';
    console.log(`${desk.name.padEnd(7, '　')} ${n}人  すきま${Math.round(minGap)}  ふちまで${Math.round(minEdge)}  ${seats}${warn}`);
  }
}
