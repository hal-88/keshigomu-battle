// はじめの席が、重なっていないか・ふちに近すぎないかを、机と人数ごとに調べる（調整用）
// 使い方: node scripts/seats.mjs
import { Game } from '../src/logic/Game.js';
import { DESKS } from '../src/config/desks.js';
import { ERASERS } from '../src/config/erasers.js';
import { edgeClearance, pointSegDist } from '../src/logic/geometry.js';

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
    // 机の 置物（ガスバーナー・包丁など）までの すきま
    let minPost = Infinity;
    for (const p of st.posts || []) {
      st.erasers.forEach((a, i) => {
        let d;
        if (p.w != null) {
          const c = Math.cos(p.angle), s = Math.sin(p.angle);
          d = pointSegDist(a.x, a.y, p.x - (c * p.w) / 2, p.y - (s * p.w) / 2, p.x + (c * p.w) / 2, p.y + (s * p.w) / 2) - p.h / 2;
        } else d = Math.hypot(a.x - p.x, a.y - p.y) - p.r;
        minPost = Math.min(minPost, d - g.extentOf(i));
      });
    }
    if (minPost < 20) minGap = Math.min(minGap, minPost);
    const seats = st.erasers.map((e) => `(${Math.round(e.x)},${Math.round(e.y)})`).join(' ');
    const warn = minGap < 20 || minEdge < 15 ? ' ⚠' : '';
    console.log(`${desk.name.padEnd(7, '　')} ${n}人  すきま${Math.round(minGap)}  ふちまで${Math.round(minEdge)}  ${seats}${warn}`);
  }
}
