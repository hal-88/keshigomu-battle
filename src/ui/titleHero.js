// タイトルの 動く 絵：机の上に 消しゴムが ならんでいて、5秒ごとに 1こが 弾かれて まん中の 大きいのに ドン！
// 画面から 消えたら 自動で 止まる。動きを へらす 設定（prefers-reduced-motion）の 端末では 止まった 絵だけ。

import { drawEraser } from '../render/drawEraser.js';
import { findEraser } from '../config/erasers.js';

const LOOP = 5000;
const ease = {
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};
const seg = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));

export function startTitleHero(cv) {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pieces = {
    a: findEraser('nerikeshi'),
    b: findEraser('fuwakaru'),
    c: findEraser('jumbo'),
    d: findEraser('kadodarake'),
    s: findEraser('white-standard'), // 弾かれる 消しゴム
  };
  let raf = 0;
  let w = 0;
  let h = 0;
  let ctx = null;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    w = cv.clientWidth;
    h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frame(now) {
    if (!cv.isConnected) return; // 画面が かわった
    if (cv.clientWidth !== w || cv.clientHeight !== h) size();
    ctx.clearRect(0, 0, w, h);
    const p = reduce ? 0.9 : (now % LOOP) / LOOP;
    const sc = Math.min(h / 82, w / 330);
    const t = now / 1000;
    const bob = (i, amp = 1.6) => (reduce ? 0 : Math.sin(t * 1.6 + i * 1.3) * amp);
    const cy = h * 0.56;

    // まん中の 大きいの（ドッシリン）
    const cx0 = w * 0.56;
    const hit = 0.24; // ぶつかる 時
    const push = ease.out(seg(p, hit, hit + 0.16)) * (1 - ease.inOut(seg(p, 0.55, 0.95)));
    const cX = cx0 + push * 26 * sc;
    const cA = -0.1 + push * 0.22;

    // 弾かれる 消しゴム（シロカク）：ひっぱる → 飛ぶ → はね返る → もどる
    const sx0 = w * 0.14;
    const contact = cx0 - (40 + 32) * sc * 0.96; // 2つの 半分の はばを たした ところ
    let sX = sx0;
    if (p < 0.13) sX = sx0 - ease.out(seg(p, 0, 0.13)) * 16 * sc;
    else if (p < hit) sX = sx0 - 16 * sc + ease.in(seg(p, 0.13, hit)) * (contact - sx0 + 16 * sc);
    else if (p < 0.4) sX = contact - ease.out(seg(p, hit, 0.4)) * (contact - sx0) * 0.35;
    else sX = contact - (contact - sx0) * (0.35 + 0.65 * ease.inOut(seg(p, 0.4, 0.9)));
    const flying = p >= 0.13 && p < hit;
    const sA = 0.06 + (p >= hit && p < 0.6 ? Math.sin(seg(p, hit, 0.6) * Math.PI) * -0.35 : 0);

    // 飛んでいる あいだの すじ
    if (flying) {
      ctx.save();
      ctx.strokeStyle = 'rgba(58, 48, 38, 0.25)';
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      for (const dy of [-9, 0, 9]) {
        const len = 18 + Math.abs(dy) * -0.6 + 26 * seg(p, 0.13, hit);
        ctx.beginPath();
        ctx.moveTo(sX - 40 * sc - len, cy + dy * sc);
        ctx.lineTo(sX - 36 * sc, cy + dy * sc);
        ctx.stroke();
      }
      ctx.restore();
    }

    // うしろの ならび
    drawEraser(ctx, pieces.b, w * 0.3, h * 0.18 + bob(1), 0.3 + bob(1, 0.03), { scale: sc * 0.78 });
    drawEraser(ctx, pieces.d, w * 0.83, h * 0.36 + bob(2), 0.25 + bob(2, 0.03), { scale: sc * 0.82 });
    drawEraser(ctx, pieces.a, w * 0.9, h * 0.8 + bob(3), 0, { scale: sc * 0.72 });
    drawEraser(ctx, pieces.c, cX, cy + bob(4, 0.8), cA, { scale: sc });
    drawEraser(ctx, pieces.s, sX, cy + (flying ? 0 : bob(0, 0.8)), sA, { scale: sc * 0.92 });

    // ドン！（火花）
    const sp = seg(p, hit, hit + 0.12);
    if (sp > 0 && sp < 1 && !reduce) {
      const x = contact + 32 * sc * 0.92;
      ctx.save();
      ctx.translate(x, cy);
      ctx.globalAlpha = 1 - sp;
      ctx.strokeStyle = '#ffb300';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.3;
        const r0 = 8 + sp * 14;
        const r1 = r0 + 10 + sp * 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0 * sc, Math.sin(a) * r0 * sc);
        ctx.lineTo(Math.cos(a) * r1 * sc, Math.sin(a) * r1 * sc);
        ctx.stroke();
      }
      ctx.font = `800 ${Math.round(22 * sc)}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff6b4a';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 5;
      ctx.strokeText('ドン！', 0, -26 * sc - sp * 10);
      ctx.fillText('ドン！', 0, -26 * sc - sp * 10);
      ctx.restore();
    }
    if (!reduce) raf = requestAnimationFrame(frame);
  }

  size();
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
