// ガチャ限定の「とくべつ消しゴム」の絵。erasers.js の look.art の名前で呼ばれる。
// どれも、消しゴムの中心が (0, 0)、長い向きが よこ（x）。上から見たところ。
// tv はとくせいの見た目（サイコロの目・ブースト中など）。選ぶ画面では undefined のこともある。

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
const gloss = (ctx, r) => {
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = g;
  ctx.fill();
};
const eyes = (ctx, dx, y, r = 2.4, color = '#222') => {
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
// 4つのとげの キラッ
const sparkle = (ctx, x, y, r, color = '#fff') => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
};
const text = (ctx, str, x, y, size, color, maxW) => {
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px "M PLUS Rounded 1c", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y, maxW);
};
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

export const SPECIAL_ART = {
  // キラリン：ラメ入り。キラキラが またたく
  glitter(ctx, s, look) {
    const { w, h, chamfer } = s;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, '#fce4ec');
    g.addColorStop(0.5, look.body);
    g.addColorStop(1, '#ce93d8');
    fill(ctx, g);
    gloss(ctx, w / 2);
    line(ctx);
    // ラメのつぶ
    const dots = [[-20, -7], [-9, 6], [4, -5], [15, 7], [21, -6], [-15, 2], [9, 2], [-3, -9], [-23, 8], [18, -1]];
    dots.forEach(([x, y], i) => {
      ctx.fillStyle = ['#fff', '#ffd54f', '#80deea', '#f48fb1'][i % 4];
      circle(ctx, (x * w) / 56, (y * h) / 30, 1.4);
      ctx.fill();
    });
    const t = now() / 300;
    sparkle(ctx, -w * 0.22, -h * 0.12, 4 + 2 * Math.abs(Math.sin(t)));
    sparkle(ctx, w * 0.25, h * 0.1, 3 + 2 * Math.abs(Math.sin(t + 1.7)));
    sparkle(ctx, w * 0.02, h * 0.2, 2 + 1.5 * Math.abs(Math.sin(t + 3.1)), '#fff59d');
  },

  // コロコイン：平たい 金色の円ばん
  coin(ctx, s, look) {
    const r = s.radius;
    circle(ctx, 0, 0, r);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    g.addColorStop(0, '#fff8d6');
    g.addColorStop(0.5, look.body);
    g.addColorStop(1, '#c79100');
    fill(ctx, g);
    line(ctx, 'rgba(120,80,0,0.6)', 2);
    circle(ctx, 0, 0, r * 0.74);
    line(ctx, 'rgba(150,100,0,0.55)', 1.5);
    // まん中の ほし
    ctx.fillStyle = 'rgba(160,110,0,0.55)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr2 = i % 2 ? r * 0.2 : r * 0.46;
      const x = Math.cos(a) * rr2;
      const y = Math.sin(a) * rr2;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // ふちの ギザギザ
    ctx.strokeStyle = 'rgba(150,100,0,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
      ctx.lineTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98);
      ctx.stroke();
    }
  },

  // サイコロン：いまの目（tv.dice）を出す
  dice(ctx, s, look, tv) {
    const { w, h, chamfer } = s;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx, 'rgba(0,0,0,0.35)', 1.8);
    const v = tv?.dice || 5;
    const q = w * 0.26;
    const P = {
      1: [[0, 0]],
      2: [[-q, -q], [q, q]],
      3: [[-q, -q], [0, 0], [q, q]],
      4: [[-q, -q], [q, -q], [-q, q], [q, q]],
      5: [[-q, -q], [q, -q], [0, 0], [-q, q], [q, q]],
      6: [[-q, -q], [q, -q], [-q, 0], [q, 0], [-q, q], [q, q]],
    }[v];
    ctx.fillStyle = v === 1 ? '#e53935' : '#263238';
    for (const [x, y] of P) {
      circle(ctx, x, y, v === 1 ? w * 0.14 : w * 0.085);
      ctx.fill();
    }
  },

  // スシケシ：シャリの上に サーモン（とれたら シャリだけ）
  sushi(ctx, s, look, tv) {
    const { w, h, chamfer } = s;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    fill(ctx, look.body);
    line(ctx, 'rgba(0,0,0,0.25)', 1.2);
    // ごはんつぶ
    ctx.fillStyle = 'rgba(200,190,170,0.6)';
    for (let i = 0; i < 16; i++) {
      const x = -w / 2 + 6 + ((i * 37) % (w - 12));
      const y = -h / 2 + 5 + ((i * 23) % (h - 10));
      ctx.beginPath();
      ctx.ellipse(x, y, 2.4, 1.2, (i * 0.7) % 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const covered = tv ? tv.covered : true;
    if (covered) {
      rr(ctx, -w / 2 - 3, -h / 2 + 1, w + 6, h - 2, h / 2 - 1);
      fill(ctx, look.neta);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * w * 0.17 - 5, -h / 2 + 3);
        ctx.quadraticCurveTo(i * w * 0.17 + 2, 0, i * w * 0.17 - 4, h / 2 - 3);
        ctx.stroke();
      }
      rr(ctx, -w / 2 - 3, -h / 2 + 1, w + 6, h - 2, h / 2 - 1);
      gloss(ctx, w / 2);
      line(ctx, 'rgba(160,60,30,0.45)', 1.2);
    }
  },

  // ドーナッツ：あなあき。ピンクの アイシングと カラフルな つぶ
  donut(ctx, s, look) {
    const r = s.radius;
    circle(ctx, 0, 0, r);
    fill(ctx, look.body);
    line(ctx, 'rgba(110,60,20,0.5)', 1.5);
    // アイシング（なみなみ）
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const rr2 = r * (0.86 + 0.05 * Math.sin(a * 7));
      const x = Math.cos(a) * rr2;
      const y = Math.sin(a) * rr2;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    fill(ctx, look.icing);
    const cols = ['#fff176', '#81d4fa', '#a5d6a7', '#fff', '#ce93d8'];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3;
      const d = r * (0.5 + 0.22 * ((i * 7) % 3) / 2);
      ctx.save();
      ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
      ctx.rotate(a * 3);
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(-2.5, -1, 5, 2);
      ctx.restore();
    }
    // あな
    circle(ctx, 0, 0, r * 0.3);
    fill(ctx, 'rgba(70,45,20,0.55)');
    circle(ctx, 0, 0, r * 0.3);
    line(ctx, 'rgba(110,60,20,0.5)', 1.2);
  },

  // ブロッケン：ポッチのある ブロック
  brick(ctx, s, look) {
    const { w, h } = s;
    rr(ctx, -w / 2, -h / 2, w, h, 3);
    fill(ctx, look.body);
    line(ctx, 'rgba(0,0,0,0.35)', 1.5);
    const cols = 4;
    const rows = 2;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = -w / 2 + (w / cols) * (i + 0.5);
        const y = -h / 2 + (h / rows) * (j + 0.5);
        circle(ctx, x + 1, y + 1.5, h * 0.2);
        fill(ctx, 'rgba(0,0,0,0.2)');
        circle(ctx, x, y, h * 0.2);
        fill(ctx, look.body);
        circle(ctx, x, y, h * 0.2);
        gloss(ctx, h * 0.2);
        line(ctx, 'rgba(0,0,0,0.25)', 1);
      }
    }
  },

  // ロケッター：先が とがった ロケット（右が前）。ブースト中は うしろから ほのお
  rocket(ctx, s, look, tv) {
    const { w, h } = s;
    if (tv?.boosting) {
      const f = 0.7 + 0.3 * Math.sin(now() / 30);
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 4, -h * 0.3);
      ctx.quadraticCurveTo(-w / 2 - 26 * f, 0, -w / 2 + 4, h * 0.3);
      ctx.closePath();
      fill(ctx, '#ff9800');
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 4, -h * 0.16);
      ctx.quadraticCurveTo(-w / 2 - 14 * f, 0, -w / 2 + 4, h * 0.16);
      ctx.closePath();
      fill(ctx, '#fff59d');
    }
    // つばさ
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 4, (sy * h) / 2 - sy * 2);
      ctx.lineTo(-w / 2 - 2, sy * (h / 2 + 7));
      ctx.lineTo(-w / 2 + 16, (sy * h) / 2 - sy * 2);
      ctx.closePath();
      fill(ctx, '#e53935');
      line(ctx, 'rgba(0,0,0,0.3)', 1);
    }
    // からだ
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 2, -h / 2 + 2);
    ctx.lineTo(w / 2 - 16, -h / 2 + 2);
    ctx.quadraticCurveTo(w / 2 + 2, 0, w / 2 - 16, h / 2 - 2);
    ctx.lineTo(-w / 2 + 2, h / 2 - 2);
    ctx.closePath();
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx);
    // 先っぽ
    ctx.beginPath();
    ctx.moveTo(w / 2 - 12, -h / 2 + 5);
    ctx.quadraticCurveTo(w / 2 + 2, 0, w / 2 - 12, h / 2 - 5);
    ctx.closePath();
    fill(ctx, '#e53935');
    // まど
    circle(ctx, w * 0.08, 0, h * 0.24);
    fill(ctx, '#4fc3f7');
    line(ctx, '#90a4ae', 2);
    circle(ctx, w * 0.08 - 2, -2, h * 0.08);
    fill(ctx, 'rgba(255,255,255,0.8)');
  },

  // ニンジャケシ：くろい ずきんに、目のところだけ あいている
  ninja(ctx, s, look) {
    const { w, h, chamfer } = s;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx, 'rgba(0,0,0,0.5)');
    // はちまき
    ctx.fillStyle = '#c62828';
    ctx.fillRect(-w / 2, -h * 0.36, w, h * 0.14);
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h * 0.3);
    ctx.lineTo(-w / 2 - 9, -h * 0.48);
    ctx.lineTo(-w / 2 - 6, -h * 0.18);
    ctx.closePath();
    ctx.fill();
    // 目のところ
    rr(ctx, -w * 0.36, -h * 0.12, w * 0.72, h * 0.28, 4);
    fill(ctx, '#ffe0b2');
    ctx.fillStyle = '#222';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * w * 0.16, h * 0.02, 2.6, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // しゅりけん マーク
    ctx.save();
    ctx.translate(0, h * 0.32);
    ctx.fillStyle = '#b0bec5';
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(1.6, -1.6);
      ctx.lineTo(0, -5);
      ctx.lineTo(-1.6, -1.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },

  // ヒカルン：くらい机では ぼんやり光る
  glow(ctx, s, look, tv) {
    const { w, h, chamfer } = s;
    const lit = tv?.glowing;
    if (lit) {
      ctx.save();
      ctx.shadowColor = look.glow;
      ctx.shadowBlur = 22 + 6 * Math.sin(now() / 260);
      rr(ctx, -w / 2, -h / 2, w, h, chamfer);
      fill(ctx, look.glow);
      ctx.restore();
    }
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    fill(ctx, lit ? '#ccff90' : look.body);
    gloss(ctx, w / 2);
    line(ctx, lit ? '#64dd17' : undefined);
    ctx.globalAlpha *= lit ? 1 : 0.6;
    sparkle(ctx, -w * 0.2, -h * 0.08, 5, lit ? '#fff' : '#a5d6a7');
    sparkle(ctx, w * 0.18, h * 0.12, 4, lit ? '#fff' : '#a5d6a7');
    circle(ctx, w * 0.24, -h * 0.2, 1.5);
    fill(ctx, lit ? '#fff' : '#a5d6a7');
  },

  // イロカワール：色が ゆっくり かわる（にじ色の グラデーション）
  thermo(ctx, s) {
    const { w, h, chamfer } = s;
    const t = now() / 1400;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    for (let i = 0; i <= 4; i++) {
      const hue = (t * 60 + i * 45) % 360;
      g.addColorStop(i / 4, `hsl(${hue}, 70%, 68%)`);
    }
    fill(ctx, g);
    gloss(ctx, w / 2);
    line(ctx);
    // ゆびのあと（ここだけ 色がかわった）
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(w * 0.12, 0, w * 0.13, h * 0.26, 0.3, 0, Math.PI * 2);
    ctx.fill();
  },

  // トゲトゲン：まわりに トゲ
  spiky(ctx, s, look) {
    const r = s.radius;
    const n = 12;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const rr2 = i % 2 ? r * 0.86 : r * 1.12;
      const x = Math.cos(a) * rr2;
      const y = Math.sin(a) * rr2;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    fill(ctx, '#7cb342');
    line(ctx, 'rgba(30,60,0,0.5)');
    circle(ctx, 0, 0, r * 0.82);
    fill(ctx, look.body);
    gloss(ctx, r);
    eyes(ctx, r * 0.3, -r * 0.08, 2.6);
    // ムッとした まゆ
    ctx.strokeStyle = '#33691e';
    ctx.lineWidth = 2;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * r * 0.45, -r * 0.36);
      ctx.lineTo(sx * r * 0.15, -r * 0.26);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, r * 0.3);
    ctx.lineTo(r * 0.15, r * 0.3);
    ctx.stroke();
  },

  // ジシャクン：赤（N）と 青（S）
  magnet(ctx, s) {
    const { w, h, chamfer } = s;
    ctx.save();
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    ctx.clip();
    ctx.fillStyle = '#ef5350';
    ctx.fillRect(0, -h / 2, w / 2, h);
    ctx.fillStyle = '#42a5f5';
    ctx.fillRect(-w / 2, -h / 2, w / 2, h);
    ctx.restore();
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    gloss(ctx, w / 2);
    line(ctx);
    text(ctx, 'N', w / 4, 1, h * 0.55, '#fff');
    text(ctx, 'S', -w / 4, 1, h * 0.55, '#fff');
    // じりょくの なみ
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.3, -0.8, 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.3, Math.PI - 0.8, Math.PI + 0.8);
    ctx.stroke();
  },

  // アイスケシ：ワッフルコーンに ピンクのアイス
  icecream(ctx, s, look) {
    const r = s.radius;
    ctx.save();
    circle(ctx, 0, 0, r);
    ctx.clip();
    // コーン（左がわ）
    ctx.fillStyle = '#e8b56a';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeStyle = 'rgba(150,90,30,0.5)';
    ctx.lineWidth = 1.2;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-r, i * 9 - r);
      ctx.lineTo(r, i * 9 + r);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r, i * 9 + r);
      ctx.lineTo(r, i * 9 - r);
      ctx.stroke();
    }
    // アイス（右がわ、たれている）
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r);
    for (let i = 0; i <= 8; i++) {
      const y = -r + (i / 8) * r * 2;
      const x = -r * 0.15 - (i % 2 ? 7 : 0) - Math.sin(i) * 3;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(r, r);
    ctx.lineTo(r, -r);
    ctx.closePath();
    fill(ctx, look.scoop);
    ctx.restore();
    circle(ctx, 0, 0, r);
    gloss(ctx, r);
    line(ctx);
    // チョコチップ
    ctx.fillStyle = '#5d4037';
    for (const [x, y] of [[r * 0.35, -r * 0.4], [r * 0.55, r * 0.15], [r * 0.2, r * 0.45], [r * 0.15, -r * 0.05]]) {
      ctx.fillRect(x - 1.5, y - 1, 3, 2);
    }
    // こおりの キラッ
    sparkle(ctx, r * 0.45, -r * 0.6, 4, '#e1f5fe');
  },

  // タマゴン：たまご（すこし ひびが入っている）
  egg(ctx, s, look) {
    const r = s.radius;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.86, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    g.addColorStop(0, '#fff');
    g.addColorStop(1, look.body);
    fill(ctx, g);
    line(ctx, 'rgba(120,100,60,0.45)');
    // もよう
    ctx.fillStyle = 'rgba(255,183,77,0.55)';
    for (const [x, y, rr2] of [[-r * 0.4, r * 0.2, 4], [r * 0.3, -r * 0.35, 3], [r * 0.5, r * 0.3, 3.5], [-r * 0.1, -r * 0.5, 2.5]]) {
      circle(ctx, x, y, rr2);
      ctx.fill();
    }
    // ひび
    ctx.strokeStyle = 'rgba(90,70,40,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.84);
    ctx.lineTo(-r * 0.02, -r * 0.55);
    ctx.lineTo(-r * 0.2, -r * 0.35);
    ctx.lineTo(r * 0.02, -r * 0.12);
    ctx.stroke();
    // のぞいている 目
    eyes(ctx, r * 0.18, r * 0.12, 2);
  },

  // ユウレイケシ：おばけ（すりぬけ中は もっと すける）
  ghost(ctx, s, look, tv) {
    const { w, h } = s;
    ctx.globalAlpha *= tv?.ghost ? 0.35 : 0.8;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.arc(w / 2 - h / 2, 0, h / 2, -Math.PI / 2, Math.PI / 2);
    // うしろは なみなみ
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const x = w / 2 - h / 2 - (i / n) * (w - h / 2);
      ctx.lineTo(x, h / 2 - (i % 2 ? 5 : 0));
    }
    ctx.lineTo(-w / 2, -h / 2);
    for (let i = n; i >= 0; i--) {
      const x = w / 2 - h / 2 - (i / n) * (w - h / 2);
      ctx.lineTo(x, -h / 2 + (i % 2 ? 5 : 0));
    }
    ctx.closePath();
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx, 'rgba(90,100,160,0.45)');
    eyes(ctx, h * 0.2, -1, 2.6, '#3949ab');
    circle(ctx, w * 0.32, 0, 2.6);
    fill(ctx, '#3949ab');
    ctx.fillStyle = 'rgba(255,170,200,0.5)';
    circle(ctx, w * 0.12, h * 0.28, 2.6);
    ctx.fill();
    circle(ctx, w * 0.12, -h * 0.28, 2.6);
    ctx.fill();
  },

  // カガミン：かがみの ケース（はね返したあとは ひび）
  mirror(ctx, s, look, tv) {
    const { w, h, chamfer } = s;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    fill(ctx, '#78909c');
    rr(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, chamfer);
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, look.body);
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.7, '#b0bec5');
    g.addColorStop(1, '#eceff1');
    fill(ctx, g);
    // うつりこみの 線
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w * 0.25, h * 0.3);
    ctx.lineTo(-w * 0.05, -h * 0.3);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.12, h * 0.3);
    ctx.lineTo(w * 0.06, -h * 0.3);
    ctx.stroke();
    if (tv?.defUsed) {
      ctx.strokeStyle = 'rgba(40,40,40,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.15, 0);
      for (const [x, y] of [[w * 0.32, -h * 0.3], [w * 0.15, 0], [w * 0.38, h * 0.2], [w * 0.15, 0], [w * 0.0, h * 0.35]]) ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      sparkle(ctx, w * 0.3, -h * 0.15, 4);
    }
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    line(ctx, 'rgba(0,0,0,0.4)');
  },

  // キョウリュウ：組み立ての きょうりゅう（右が あたま、左が しっぽ）
  dinokit(ctx, s, look) {
    const { w, h } = s;
    // しっぽ
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6, -h * 0.2);
    ctx.lineTo(-w / 2 - 10, 0);
    ctx.lineTo(-w / 2 + 6, h * 0.2);
    ctx.closePath();
    fill(ctx, '#43a047');
    line(ctx, 'rgba(0,50,0,0.4)', 1);
    // せなかの トゲ（上と下）
    ctx.fillStyle = '#ffb300';
    for (let i = 0; i < 4; i++) {
      const x = -w * 0.3 + i * w * 0.16;
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x - 5, (sy * h) / 2 - sy * 2);
        ctx.lineTo(x, sy * (h / 2 + 5));
        ctx.lineTo(x + 5, (sy * h) / 2 - sy * 2);
        ctx.closePath();
        ctx.fill();
      }
    }
    rr(ctx, -w / 2 + 2, -h / 2, w - 4, h, s.chamfer);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx, 'rgba(0,60,0,0.5)');
    // くみたての つなぎめ
    ctx.strokeStyle = 'rgba(0,60,0,0.35)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 2]);
    for (const x of [-w * 0.18, w * 0.14]) {
      ctx.beginPath();
      ctx.moveTo(x, -h / 2 + 2);
      ctx.lineTo(x, h / 2 - 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // かお
    eyes(ctx, h * 0.18, 0, 2.4);
    ctx.save();
    ctx.translate(w * 0.3, 0);
    ctx.fillStyle = '#fff';
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.1, sy * 3);
      ctx.lineTo(w * 0.14, sy * 6);
      ctx.lineTo(w * 0.06, sy * 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.translate(0, 0);
  },

  // カラッポ：中身のない 紙ケースだけ
  emptycase(ctx, s, look) {
    const { w, h } = s;
    rr(ctx, -w / 2, -h / 2, w, h, s.chamfer);
    fill(ctx, look.body);
    line(ctx, 'rgba(0,60,90,0.5)');
    // 中は からっぽ（机が見える）
    rr(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 3);
    fill(ctx, 'rgba(255,255,255,0.35)');
    ctx.setLineDash([4, 3]);
    line(ctx, 'rgba(0,60,90,0.4)', 1.2);
    ctx.setLineDash([]);
    text(ctx, 'からっぽ', 0, 1, h * 0.32, 'rgba(0,70,110,0.7)', w * 0.7);
    // ほこり
    ctx.fillStyle = 'rgba(120,120,120,0.35)';
    circle(ctx, w * 0.3, h * 0.15, 1.5);
    ctx.fill();
    circle(ctx, -w * 0.32, -h * 0.12, 1.2);
    ctx.fill();
  },

  // ダイオウケシ：記念品サイズ。むらさきの ケースに 金の おうかん
  giant(ctx, s, look) {
    const { w, h, chamfer } = s;
    rr(ctx, -w / 2, -h / 2, w, h, chamfer);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx, 'rgba(0,0,0,0.4)', 2);
    rr(ctx, -w * 0.32, -h / 2 - 1, w * 0.64, h + 2, 3);
    fill(ctx, look.sleeve);
    line(ctx, 'rgba(0,0,0,0.3)', 1.5);
    // 金の わく
    rr(ctx, -w * 0.28, -h / 2 + 5, w * 0.56, h - 10, 4);
    line(ctx, '#ffd54f', 2);
    // おうかん
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    const cx = 0;
    const cy = -h * 0.12;
    ctx.moveTo(cx - 12, cy + 6);
    ctx.lineTo(cx - 12, cy - 4);
    ctx.lineTo(cx - 6, cy + 1);
    ctx.lineTo(cx, cy - 8);
    ctx.lineTo(cx + 6, cy + 1);
    ctx.lineTo(cx + 12, cy - 4);
    ctx.lineTo(cx + 12, cy + 6);
    ctx.closePath();
    ctx.fill();
    text(ctx, 'ダイオウ', 0, h * 0.22, h * 0.24, '#fff', w * 0.5);
  },

  // マッサラ：新品。まっ白で かどが ピンピン、青いケースに NEW
  brandnew(ctx, s, look) {
    const { w, h } = s;
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    fill(ctx, look.body);
    gloss(ctx, w / 2);
    line(ctx, 'rgba(0,0,0,0.45)', 1.2);
    ctx.fillStyle = look.sleeve;
    ctx.fillRect(-w * 0.2, -h / 2, w * 0.56, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-w * 0.2, -h / 2 + 3, w * 0.56, 2);
    ctx.fillRect(-w * 0.2, h / 2 - 5, w * 0.56, 2);
    text(ctx, 'NEW', w * 0.08, 1, h * 0.36, '#fff', w * 0.5);
    // かどの キラッ
    const t = now() / 400;
    sparkle(ctx, -w / 2 + 1, -h / 2 + 1, 4 + 2 * Math.abs(Math.sin(t)));
    sparkle(ctx, w / 2 - 1, h / 2 - 1, 3 + 2 * Math.abs(Math.sin(t + 2)));
  },
};
