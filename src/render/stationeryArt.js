// ガチャ限定の文房具の絵。erasers.js の look.art の名前で呼ばれる。
// どれも、消しゴムの中心が (0, 0)、長い向きが よこ（x）になるように描く。
// 当たり判定は shape（四角・三角・丸）のまま。絵はその中におさまるように描く。

import { roundRectPath } from './drawEraser.js';

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
};

const outline = (ctx, color = 'rgba(40,30,20,0.45)', w = 1.5) => {
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
};

export const STATIONERY_ART = {
  // ホッチキス：こんいろの台と、銀色のうで
  stapler(ctx, s, look) {
    const { w, h } = s;
    rr(ctx, -w / 2, -h / 2, w, h, 6);
    ctx.fillStyle = look.body;
    ctx.fill();
    outline(ctx);
    rr(ctx, -w / 2 + 3, -h / 2 + 3, w - 12, h * 0.55, 5);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h * 0.1);
    g.addColorStop(0, '#f2f4f7');
    g.addColorStop(1, '#a9b1bc');
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx, 'rgba(60,70,90,0.5)', 1);
    ctx.fillStyle = '#1d2f50';
    ctx.beginPath();
    ctx.arc(-w / 2 + 8, h * 0.18, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(w / 2 - 14, h * 0.15, 8, 2);
  },

  // えんぴつ：黄色い軸、けずった先、ピンクの消しゴム
  pencil(ctx, s, look) {
    const { w, h } = s;
    const hl = w / 2;
    const hw = h / 2;
    ctx.fillStyle = '#f48fb1';
    rr(ctx, -hl, -hw, 10, h, 3);
    ctx.fill();
    ctx.fillStyle = '#c9ccd1';
    ctx.fillRect(-hl + 8, -hw, 8, h);
    ctx.fillStyle = look.body;
    ctx.fillRect(-hl + 16, -hw, w - 16 - 18, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-hl + 16, -hw + 1.5, w - 34, h * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(-hl + 16, hw - h * 0.3, w - 34, h * 0.3);
    ctx.fillStyle = '#f2d2a0';
    ctx.beginPath();
    ctx.moveTo(hl - 18, -hw);
    ctx.lineTo(hl, 0);
    ctx.lineTo(hl - 18, hw);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(hl - 6, -hw * 0.35);
    ctx.lineTo(hl, 0);
    ctx.lineTo(hl - 6, hw * 0.35);
    ctx.closePath();
    ctx.fill();
  },

  // シャーペン：すける青い軸、黒いグリップ、銀の先
  mechpencil(ctx, s, look) {
    const { w, h } = s;
    const hl = w / 2;
    const hw = h / 2;
    ctx.fillStyle = '#eceff1';
    rr(ctx, -hl, -hw, 9, h, 3);
    ctx.fill();
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = look.body;
    rr(ctx, -hl + 8, -hw, w - 8 - 14, h, 3);
    ctx.fill();
    ctx.globalAlpha /= 0.9;
    ctx.fillStyle = '#263238';
    ctx.fillRect(hl - 36, -hw, 20, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let x = hl - 34; x < hl - 18; x += 4) ctx.fillRect(x, -hw, 1.5, h);
    ctx.fillStyle = '#b0bec5';
    ctx.beginPath();
    ctx.moveTo(hl - 16, -hw);
    ctx.lineTo(hl - 2, -1.2);
    ctx.lineTo(hl, 0);
    ctx.lineTo(hl - 2, 1.2);
    ctx.lineTo(hl - 16, hw);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(-hl + 12, -hw + 1.5, w - 54, 1.5);
    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-hl + 12, -hw - 0.5);
    ctx.lineTo(-hl + 32, -hw - 0.5);
    ctx.stroke();
  },

  // はさみ：赤い持ち手の輪と、銀の刃
  scissors(ctx, s, look) {
    const { w, h } = s;
    const hl = w / 2;
    const hw = h / 2;
    const blade = (dy) => {
      ctx.beginPath();
      ctx.moveTo(-4, dy * 0.25);
      ctx.lineTo(hl, dy * 0.08);
      ctx.lineTo(hl - 6, dy * 0.42);
      ctx.lineTo(-4, dy * 0.9);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -hw, 0, hw);
      g.addColorStop(0, '#f5f7fa');
      g.addColorStop(1, '#9aa5b1');
      ctx.fillStyle = g;
      ctx.fill();
      outline(ctx, 'rgba(60,70,80,0.5)', 1);
    };
    blade(-hw);
    blade(hw);
    for (const dy of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-hl + 12, dy * hw * 0.52, 9, hw * 0.36, dy * 0.35, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = look.body;
      ctx.stroke();
      // 持ち手から刃へつなぐ
      ctx.beginPath();
      ctx.moveTo(-hl + 20, dy * hw * 0.45);
      ctx.lineTo(-3, dy * hw * 0.12);
      ctx.stroke();
    }
    ctx.fillStyle = '#546e7a';
    ctx.beginPath();
    ctx.arc(-2, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  },

  // クリップ：色つきのワイヤーがぐるぐる
  clip(ctx, s, look) {
    const { w, h } = s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const loop = (x0, x1, half) => {
      ctx.beginPath();
      ctx.moveTo(x1, -half);
      ctx.lineTo(x0 + half, -half);
      ctx.arc(x0 + half, 0, half, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(x1, half);
    };
    ctx.strokeStyle = look.body;
    ctx.lineWidth = 3.2;
    const hw = h / 2 - 2;
    loop(-w / 2 + 2, w / 2 - hw - 2, hw);
    ctx.arc(w / 2 - hw - 2, 0, hw, Math.PI / 2, -Math.PI / 2, true);
    ctx.lineTo(-w / 2 + 10, -hw);
    ctx.stroke();
    ctx.beginPath();
    const ih = hw * 0.55;
    ctx.moveTo(w / 2 - 12, ih);
    ctx.lineTo(-w / 2 + 8 + ih, ih);
    ctx.arc(-w / 2 + 8 + ih, 0, ih, Math.PI / 2, -Math.PI / 2);
    ctx.lineTo(w / 2 - 18, -ih);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 12, -hw - 0.8);
    ctx.lineTo(w / 2 - 14, -hw - 0.8);
    ctx.stroke();
  },

  // スティックのり：白い本体、ラベル、色つきのキャップ
  glue(ctx, s, look) {
    const { w, h } = s;
    const hl = w / 2;
    const hw = h / 2;
    rr(ctx, -hl, -hw, w - 16, h, 6);
    ctx.fillStyle = look.body;
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = look.label;
    ctx.fillRect(-hl + 10, -hw, w * 0.42, h);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${h * 0.42}px "M PLUS Rounded 1c", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('のり', -hl + 10 + w * 0.21, 1, w * 0.4);
    rr(ctx, hl - 20, -hw - 1, 20, h + 2, 6);
    ctx.fillStyle = look.label;
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    outline(ctx);
  },

  // コンパス：銀の2本足、上のつまみ、えんぴつの芯と針
  compass(ctx, s) {
    const r = s.radius;
    const pts = [0, 1, 2].map((i) => {
      const a = Math.PI / 3 + (i * Math.PI * 2) / 3;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
    // 三角の当たり判定をうすく見せる
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(200,210,220,0.35)';
    ctx.fill();
    const top = pts[2]; // 左にある角を「つまみ」にする
    ctx.lineCap = 'round';
    for (const [p, col] of [[pts[0], '#90a4ae'], [pts[1], '#b0bec5']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(p.x * 0.85, p.y * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(pts[0].x * 0.9, pts[0].y * 0.9, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6c445';
    ctx.beginPath();
    ctx.arc(pts[1].x * 0.88, pts[1].y * 0.88, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.arc(top.x * 0.85, top.y * 0.85, 6, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx);
  },

  // ぶんどき：すける円い板に目もり
  protractor(ctx, s, look) {
    const r = s.radius;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = look.body;
    ctx.globalAlpha *= 0.85;
    ctx.fill();
    ctx.globalAlpha /= 0.85;
    outline(ctx, 'rgba(50,110,170,0.8)', 1.5);
    ctx.strokeStyle = 'rgba(30,80,140,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const l = i % 9 === 0 ? 8 : i % 3 === 0 ? 5 : 3;
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * (r - l), Math.sin(a) * (r - l));
    }
    ctx.moveTo(-r * 0.55, 0);
    ctx.lineTo(r * 0.55, 0);
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(0, r * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    outline(ctx, 'rgba(30,80,140,0.8)', 1);
  },

  // セロハンテープ：すけるテープの輪と、まん中の紙のしん
  tape(ctx, s, look) {
    const r = s.radius;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, look.body);
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx, 'rgba(120,150,180,0.7)', 1.5);
    ctx.strokeStyle = 'rgba(150,180,210,0.35)';
    ctx.lineWidth = 1;
    for (let k = 0.72; k < 1; k += 0.07) {
      ctx.beginPath();
      ctx.arc(0, 0, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = '#d9b98a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#8d9aa6';
    ctx.fill();
  },

  // けいこうペン：あざやかな黄色、キャップ、クリップ
  marker(ctx, s, look) {
    const { w, h } = s;
    const hl = w / 2;
    const hw = h / 2;
    rr(ctx, -hl + 20, -hw, w - 24, h, 8);
    ctx.fillStyle = look.body;
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(hl - 5, -hw * 0.5);
    ctx.lineTo(hl, -hw * 0.2);
    ctx.lineTo(hl, hw * 0.5);
    ctx.lineTo(hl - 5, hw * 0.5);
    ctx.closePath();
    ctx.fill();
    rr(ctx, -hl, -hw, 26, h, 8);
    ctx.fillStyle = '#f2b600';
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-hl + 4, -hw - 1, 18, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-hl + 28, -hw + 2.5, w - 40, 2.5);
  },
};
