// とくせいのある消しゴムと、キャラ消しゴムの絵。erasers.js の look.art の名前で呼ばれる。
// どれも、消しゴムの中心が (0, 0)、長い向きが よこ（x）。上から見たところ。
// tv はとくせいの見た目（カバーがある・パーツの数など）。選ぶ画面では undefined のこともある。

import { roundRectPath } from './drawEraser.js';

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
};
const circle = (ctx, x, y, r) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
};
const fill = (ctx, color) => {
  ctx.fillStyle = color;
  ctx.fill();
};
const line = (ctx, color = 'rgba(40,30,20,0.45)', w = 1.5) => {
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
};
// つや（左上が明るい）
const gloss = (ctx, r) => {
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = g;
  ctx.fill();
};
// 顔のパーツ
const eyes = (ctx, dx, y, r = 2.6, color = '#222') => {
  ctx.fillStyle = color;
  for (const sx of [-1, 1]) {
    circle(ctx, sx * dx, y, r);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  for (const sx of [-1, 1]) {
    circle(ctx, sx * dx + r * 0.35, y - r * 0.35, r * 0.35);
    ctx.fill();
  }
};
const cheeks = (ctx, dx, y, r = 3.5, color = 'rgba(255,120,140,0.45)') => {
  ctx.fillStyle = color;
  for (const sx of [-1, 1]) {
    circle(ctx, sx * dx, y, r);
    ctx.fill();
  }
};

export const ERASER_ART = {
  // ---- とくせいのある消しゴム ----

  // スティッカー：ペン型・ノック式
  knock(ctx, s, look) {
    const { w, h } = s;
    rr(ctx, -w / 2, -h / 2, w, h, h / 2);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx);
    // 先の白い消しゴム
    rr(ctx, w / 2 - 14, -h / 2 + 2, 14, h - 4, (h - 4) / 2);
    fill(ctx, '#fafafa');
    line(ctx, 'rgba(0,0,0,0.25)', 1);
    // ノック
    rr(ctx, -w / 2 - 2, -h / 4, 8, h / 2, 3);
    fill(ctx, '#d1c4e9');
    // クリップ
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-w / 2 + 10, -h / 2 + 2, w * 0.4, 2.5);
  },

  // クリアン：すきとおった消しゴム
  clear(ctx, s, look) {
    const { w, h, chamfer } = s;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    ctx.globalAlpha *= 0.65;
    fill(ctx, look.body);
    ctx.globalAlpha /= 0.65;
    line(ctx, 'rgba(60,140,200,0.8)', 1.5);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6, -h / 2 + 4);
    ctx.lineTo(-w / 2 + 22, -h / 2 + 4);
    ctx.lineTo(-w / 2 + 10, h / 2 - 4);
    ctx.lineTo(-w / 2 + 5, h / 2 - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(w / 2 - 14, -h / 2 + 5, 4, h - 10);
  },

  // ころまる：ボール
  ball(ctx, s, look) {
    const r = s.radius;
    circle(ctx, 0, 0, r);
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, look.body);
    g.addColorStop(1, '#e89ab8');
    ctx.fillStyle = g;
    ctx.fill();
    line(ctx);
    // ころがるのがわかる線
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.65, -0.6, 1.2);
    line(ctx, 'rgba(255,255,255,0.7)', 2);
  },

  // フルーツン：いちごのにおい（いちごの絵のケース）
  fruit(ctx, s, look) {
    const { w, h, chamfer } = s;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx);
    // いちご
    ctx.save();
    ctx.translate(0, 1);
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.quadraticCurveTo(0, -9, 8, -5);
    ctx.quadraticCurveTo(7, 6, 0, 10);
    ctx.quadraticCurveTo(-7, 6, -8, -5);
    fill(ctx, '#e53950');
    ctx.fillStyle = '#ffe082';
    for (const [x, y] of [[-3, -1], [3, -1], [0, 3], [-3, 5], [3, 5]]) {
      circle(ctx, x, y, 0.9);
      ctx.fill();
    }
    ctx.fillStyle = '#43a047';
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(0, -3);
    ctx.lineTo(6, -6);
    ctx.lineTo(0, -9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // においの線
    ctx.strokeStyle = 'rgba(255,111,145,0.7)';
    ctx.lineWidth = 1.5;
    for (const x of [-w / 2 + 7, w / 2 - 7]) {
      ctx.beginPath();
      ctx.moveTo(x, -6);
      ctx.quadraticCurveTo(x + 3, -2, x, 2);
      ctx.quadraticCurveTo(x - 3, 6, x, 9);
      ctx.stroke();
    }
  },

  // パカッター：割れた消しゴム（ギザギザの断面）
  pakatter(ctx, s, look) {
    const { w, h } = s;
    const x0 = -w / 2;
    const x1 = w / 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 4, -h / 2);
    ctx.lineTo(x1 - 6, -h / 2);
    // 右がわはギザギザ（割れたところ）
    const n = 5;
    for (let i = 1; i <= n; i++) {
      const y = -h / 2 + (h * i) / n;
      ctx.lineTo(i % 2 ? x1 : x1 - 7, y);
    }
    ctx.lineTo(x0 + 4, h / 2);
    if (look.half) {
      // 分かれたかけらは、左がわもギザギザ
      for (let i = n - 1; i >= 0; i--) {
        const y = -h / 2 + (h * i) / n;
        ctx.lineTo(i % 2 ? x0 + 7 : x0, y);
      }
    } else {
      ctx.quadraticCurveTo(x0, h / 2, x0, h / 2 - 4);
      ctx.lineTo(x0, -h / 2 + 4);
      ctx.quadraticCurveTo(x0, -h / 2, x0 + 4, -h / 2);
    }
    ctx.closePath();
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx);
    // のこったケース
    if (!look.half) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = look.sleeve;
      ctx.fillRect(x0 + w * 0.15, -h / 2, w * 0.35, h);
      ctx.restore();
    }
  },

  // ガードン：カバー（スリーブ）つき。カバーが外れると中身だけ
  cover(ctx, s, look, tv) {
    const { w, h, chamfer } = s;
    const covered = tv ? tv.covered : true;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx);
    if (covered) {
      // 消しゴムをすっぽりつつむカバー
      rr(ctx, -w / 2 - 2, -h / 2 - 2, w * 0.82, h + 4, 3);
      fill(ctx, look.sleeve);
      line(ctx, 'rgba(0,0,0,0.3)', 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `800 ${h * 0.36}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ガード', -w / 2 + (w * 0.82) / 2 - 2, 1, w * 0.7);
      // 盾マーク
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 1, w * 0.78, 3);
    } else {
      // 外れたあと：ケースのあとだけ
      ctx.strokeStyle = 'rgba(38,166,154,0.35)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w * 0.76, h - 6);
      ctx.setLineDash([]);
    }
  },

  // ブルブル：電動消しゴム（電池の本体と、先の白い消しゴム）
  electric(ctx, s, look) {
    const { w, h } = s;
    rr(ctx, -w / 2, -h / 2, w - 12, h, h / 2);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx);
    rr(ctx, w / 2 - 16, -h / 2 + 3, 16, h - 6, (h - 6) / 2);
    fill(ctx, '#fafafa');
    line(ctx, 'rgba(0,0,0,0.25)', 1);
    // スイッチ
    rr(ctx, -w / 2 + 12, -h / 2 + 4, 12, h - 8, 3);
    fill(ctx, '#ffca28');
    // ランプ
    circle(ctx, -w / 2 + 6, 0, 2.5);
    fill(ctx, '#76ff03');
  },

  // ツートン：赤（前）と青（後ろ）
  twotone(ctx, s, look) {
    const { w, h, chamfer } = s;
    ctx.save();
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    ctx.clip();
    ctx.fillStyle = look.back;
    ctx.fillRect(-w / 2, -h / 2, w / 2, h);
    ctx.fillStyle = look.front;
    ctx.fillRect(0, -h / 2, w / 2, h);
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    gloss(ctx, w / 2);
    // 白い紙ケース（まんなか）
    ctx.fillStyle = '#fff';
    ctx.fillRect(-w * 0.14, -h / 2, w * 0.28, h);
    ctx.fillStyle = '#333';
    ctx.font = `800 ${h * 0.34}px "M PLUS Rounded 1c", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2色', 0, 1, w * 0.26);
    ctx.restore();
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    line(ctx);
  },

  // ガッタイン：組み立て式（外れるパーツが3つ）
  parts(ctx, s, look, tv) {
    const { w, h } = s;
    const left = tv ? tv.parts : 3;
    rr(ctx, -w / 2 + 6, -h / 2 + 5, w - 12, h - 10, 4);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx);
    // 顔（ロボットみたいに）
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(-7, -3, 4, 4);
    ctx.fillRect(3, -3, 4, 4);
    ctx.fillRect(-4, 4, 8, 2);
    const parts = [
      { x: -w / 2, y: -h / 2 + 7, pw: 9, ph: h - 14, c: '#42a5f5' }, // 左のうで
      { x: w / 2 - 9, y: -h / 2 + 7, pw: 9, ph: h - 14, c: '#ef5350' }, // 右のうで
      { x: -10, y: -h / 2, pw: 20, ph: 7, c: '#ffca28' }, // ぼうし
    ];
    parts.slice(0, left).forEach((p) => {
      rr(ctx, p.x, p.y, p.pw, p.ph, 3);
      fill(ctx, p.c);
      line(ctx, 'rgba(0,0,0,0.3)', 1);
    });
  },

  // ---- キャラ消しゴム ----

  cat(ctx, s, look) {
    const r = s.radius;
    // 耳
    ctx.fillStyle = look.body;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * r * 0.25, -r * 0.85);
      ctx.lineTo(sx * r * 0.85, -r * 1.05);
      ctx.lineTo(sx * r * 0.8, -r * 0.35);
      ctx.closePath();
      ctx.fill();
      line(ctx);
    }
    circle(ctx, 0, 0, r);
    fill(ctx, look.body);
    gloss(ctx, r);
    line(ctx);
    // しましま
    ctx.strokeStyle = 'rgba(200,110,20,0.6)';
    ctx.lineWidth = 2.5;
    for (const dx of [-5, 0, 5]) {
      ctx.beginPath();
      ctx.moveTo(dx, -r * 0.95);
      ctx.lineTo(dx, -r * 0.65);
      ctx.stroke();
    }
    eyes(ctx, r * 0.36, -r * 0.08);
    cheeks(ctx, r * 0.6, r * 0.25);
    ctx.fillStyle = '#e57373';
    ctx.beginPath();
    ctx.moveTo(-2.5, r * 0.15);
    ctx.lineTo(2.5, r * 0.15);
    ctx.lineTo(0, r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,20,0.6)';
    ctx.lineWidth = 1;
    for (const sx of [-1, 1]) {
      for (const dy of [-2, 2]) {
        ctx.beginPath();
        ctx.moveTo(sx * r * 0.3, r * 0.25 + dy);
        ctx.lineTo(sx * r * 0.9, r * 0.2 + dy * 2);
        ctx.stroke();
      }
    }
  },

  dog(ctx, s, look) {
    const r = s.radius;
    circle(ctx, 0, 0, r);
    fill(ctx, look.body);
    gloss(ctx, r);
    line(ctx);
    // たれ耳
    ctx.fillStyle = '#8d6e63';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * r * 0.78, -r * 0.2, r * 0.28, r * 0.5, sx * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 口のまわり
    ctx.beginPath();
    ctx.ellipse(0, r * 0.32, r * 0.42, r * 0.3, 0, 0, Math.PI * 2);
    fill(ctx, '#f5e6d3');
    eyes(ctx, r * 0.33, -r * 0.12);
    circle(ctx, 0, r * 0.2, 3.5);
    fill(ctx, '#3e2723');
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(-2.5, r * 0.32, 2.5, 0, Math.PI);
    ctx.arc(2.5, r * 0.32, 2.5, 0, Math.PI);
    ctx.stroke();
  },

  dino(ctx, s, look) {
    const { w, h, chamfer } = s;
    // せなかのトゲ
    ctx.fillStyle = '#ffb300';
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + 12 + i * 11;
      ctx.beginPath();
      ctx.moveTo(x - 5, -h / 2 + 2);
      ctx.lineTo(x, -h / 2 - 6);
      ctx.lineTo(x + 5, -h / 2 + 2);
      ctx.closePath();
      ctx.fill();
    }
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx);
    // おなか
    ctx.beginPath();
    ctx.ellipse(-4, h * 0.18, w * 0.25, h * 0.2, 0, 0, Math.PI * 2);
    fill(ctx, '#c5e1a5');
    // 顔は右がわ
    ctx.save();
    ctx.translate(w / 2 - 12, 0);
    ctx.fillStyle = '#222';
    circle(ctx, 0, -h * 0.12, 2.8);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 18, h * 0.1);
    ctx.lineTo(w / 2 - 6, h * 0.12);
    ctx.stroke();
    // しっぽのもよう
    ctx.fillStyle = 'rgba(46,125,50,0.5)';
    for (const [x, y] of [[-w / 2 + 10, 0], [-w / 2 + 18, -6]]) {
      circle(ctx, x, y, 2.5);
      ctx.fill();
    }
  },

  rabbit(ctx, s, look) {
    const r = s.radius;
    // 長い耳（うしろにたおれている）
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * r * 0.35, -r * 1.05, r * 0.22, r * 0.55, sx * 0.15, 0, Math.PI * 2);
      fill(ctx, look.body);
      line(ctx);
      ctx.beginPath();
      ctx.ellipse(sx * r * 0.35, -r * 1.05, r * 0.1, r * 0.38, sx * 0.15, 0, Math.PI * 2);
      fill(ctx, '#f8bbd0');
    }
    circle(ctx, 0, 0, r);
    fill(ctx, look.body);
    gloss(ctx, r);
    line(ctx);
    eyes(ctx, r * 0.36, -r * 0.05, 2.6, '#c2185b');
    cheeks(ctx, r * 0.58, r * 0.28);
    ctx.fillStyle = '#f48fb1';
    circle(ctx, 0, r * 0.18, 2.5);
    ctx.fill();
  },

  penguin(ctx, s, look) {
    const r = s.radius;
    circle(ctx, 0, 0, r);
    fill(ctx, look.body);
    gloss(ctx, r);
    line(ctx);
    // 白い顔
    ctx.beginPath();
    ctx.ellipse(0, r * 0.12, r * 0.72, r * 0.68, 0, 0, Math.PI * 2);
    fill(ctx, '#fafafa');
    eyes(ctx, r * 0.3, -r * 0.02);
    // くちばし
    ctx.fillStyle = '#ffa726';
    ctx.beginPath();
    ctx.moveTo(-4, r * 0.18);
    ctx.lineTo(4, r * 0.18);
    ctx.lineTo(0, r * 0.36);
    ctx.closePath();
    ctx.fill();
    cheeks(ctx, r * 0.52, r * 0.3, 3, 'rgba(255,120,140,0.4)');
  },

  panda(ctx, s, look) {
    const r = s.radius;
    ctx.fillStyle = '#222';
    for (const sx of [-1, 1]) {
      circle(ctx, sx * r * 0.7, -r * 0.72, r * 0.3);
      ctx.fill();
    }
    circle(ctx, 0, 0, r);
    fill(ctx, look.body);
    gloss(ctx, r);
    line(ctx);
    // 目のまわりの黒
    ctx.fillStyle = '#222';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * r * 0.36, -r * 0.05, r * 0.2, r * 0.27, sx * -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    for (const sx of [-1, 1]) {
      circle(ctx, sx * r * 0.36, -r * 0.08, 2.4);
      ctx.fill();
    }
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.24, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    cheeks(ctx, r * 0.62, r * 0.32, 3.5, 'rgba(255,120,140,0.35)');
  },

  pig(ctx, s, look) {
    const r = s.radius;
    ctx.fillStyle = '#f48fb1';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * r * 0.35, -r * 0.88);
      ctx.lineTo(sx * r * 0.9, -r * 0.85);
      ctx.lineTo(sx * r * 0.7, -r * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    circle(ctx, 0, 0, r);
    fill(ctx, look.body);
    gloss(ctx, r);
    line(ctx);
    eyes(ctx, r * 0.38, -r * 0.18);
    // はな
    ctx.beginPath();
    ctx.ellipse(0, r * 0.22, r * 0.32, r * 0.22, 0, 0, Math.PI * 2);
    fill(ctx, '#f48fb1');
    line(ctx, 'rgba(194,24,91,0.4)', 1);
    ctx.fillStyle = '#ad1457';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 3.5, r * 0.22, 1.6, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  frog(ctx, s, look) {
    const r = s.radius;
    // 大きな目（頭の上にでっぱる）
    for (const sx of [-1, 1]) {
      circle(ctx, sx * r * 0.45, -r * 0.7, r * 0.34);
      fill(ctx, look.body);
      line(ctx);
    }
    circle(ctx, 0, 0, r);
    fill(ctx, look.body);
    gloss(ctx, r);
    line(ctx);
    for (const sx of [-1, 1]) {
      circle(ctx, sx * r * 0.45, -r * 0.7, r * 0.22);
      fill(ctx, '#fff');
      circle(ctx, sx * r * 0.45, -r * 0.68, r * 0.12);
      fill(ctx, '#222');
    }
    ctx.strokeStyle = '#33691e';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, r * 0.05, r * 0.5, 0.25, Math.PI - 0.25);
    ctx.stroke();
    cheeks(ctx, r * 0.62, r * 0.3, 3.5, 'rgba(255,138,128,0.45)');
  },

  turtle(ctx, s, look) {
    const r = s.radius;
    // 頭と足（六角形のこうらから出ている）
    ctx.fillStyle = '#a5d6a7';
    circle(ctx, r * 1.0, 0, r * 0.3);
    ctx.fill();
    for (const a of [0.8, -0.8, Math.PI - 0.8, Math.PI + 0.8]) {
      circle(ctx, Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.18);
      ctx.fill();
    }
    ctx.fillStyle = '#222';
    circle(ctx, r * 1.08, -r * 0.1, 1.6);
    ctx.fill();
    // こうら
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    fill(ctx, look.body);
    gloss(ctx, r);
    line(ctx);
    // こうらのもよう
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const x = Math.cos(a) * r * 0.45;
      const y = Math.sin(a) * r * 0.45;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    fill(ctx, '#a1887f');
    line(ctx, 'rgba(62,39,35,0.5)', 1.2);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    line(ctx, 'rgba(62,39,35,0.5)', 1.2);
  },

  chick(ctx, s, look) {
    const r = s.radius;
    circle(ctx, 0, 0, r);
    fill(ctx, look.body);
    gloss(ctx, r);
    line(ctx);
    // あたまのけ
    ctx.strokeStyle = '#f9a825';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, -r);
    ctx.quadraticCurveTo(0, -r - 6, 3, -r - 3);
    ctx.stroke();
    eyes(ctx, r * 0.36, -r * 0.1, 2.3);
    ctx.fillStyle = '#ff8f00';
    ctx.beginPath();
    ctx.moveTo(-3.5, r * 0.12);
    ctx.lineTo(3.5, r * 0.12);
    ctx.lineTo(0, r * 0.35);
    ctx.closePath();
    ctx.fill();
    cheeks(ctx, r * 0.6, r * 0.25, 3, 'rgba(255,138,101,0.5)');
    // つばさ
    ctx.fillStyle = 'rgba(249,168,37,0.5)';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * r * 0.88, r * 0.2, r * 0.18, r * 0.32, sx * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
