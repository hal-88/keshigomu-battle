// 消しゴム1個を Canvas に描く（対戦画面と選択画面の両方で使う）

import { eraserExtent } from '../logic/geometry.js';
import { STATIONERY_ART } from './stationeryArt.js';
import { ERASER_ART } from './eraserArt.js';

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shapePath(ctx, shape, ox = 0, oy = 0, blob = false) {
  ctx.beginPath();
  if (shape.type === 'circle' && blob) {
    // ねりけし：少しでこぼこした丸
    const n = 36;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = shape.radius * (1 + 0.05 * Math.sin(a * 5) + 0.03 * Math.sin(a * 3 + 1));
      const x = ox + Math.cos(a) * r;
      const y = oy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (shape.type === 'rect') {
    roundRectPath(ctx, -shape.w / 2 + ox, -shape.h / 2 + oy, shape.w, shape.h, shape.chamfer || 0);
  } else if (shape.type === 'circle') {
    ctx.arc(ox, oy, shape.radius, 0, Math.PI * 2);
  } else if (shape.type === 'polygon') {
    // Matter.js の Bodies.polygon と同じ角の位置
    const th = (Math.PI * 2) / shape.sides;
    for (let i = 0; i < shape.sides; i++) {
      const a = th / 2 + i * th;
      const x = ox + Math.cos(a) * shape.radius;
      const y = oy + Math.sin(a) * shape.radius;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

// tv … とくせいの見た目（Game の getState().erasers[i].trait）。選ぶ画面などでは なくてよい
export function drawEraser(ctx, def, x, y, angle, { scale = 1, alpha = 1, shadow = true, tv = null } = {}) {
  const s = def.shape;
  const look = def.look;
  const ext = eraserExtent(def);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  // グニャット：当てられた瞬間にぐにゃっとつぶれる
  if (tv && tv.squish > 0) ctx.scale(1 + 0.22 * tv.squish, 1 - 0.18 * tv.squish);
  ctx.globalAlpha *= alpha;

  const blob = !!look.blob;

  // かげ
  if (shadow) {
    ctx.fillStyle = look.art ? 'rgba(50, 30, 10, 0.18)' : 'rgba(50, 30, 10, 0.28)';
    shapePath(ctx, s, 3, 5, blob);
    ctx.fill();
  }

  // 文房具・とくせいのある消しゴム・キャラ：専用の絵で描く
  const art = look.art && (STATIONERY_ART[look.art] || ERASER_ART[look.art]);
  if (art) {
    art(ctx, s, look, tv);
    ctx.restore();
    return;
  }

  // 本体
  shapePath(ctx, s, 0, 0, blob);
  ctx.fillStyle = look.body;
  ctx.fill();

  // すなけし：ざらざらのつぶ
  if (look.speckle) {
    ctx.save();
    shapePath(ctx, s, 0, 0, blob);
    ctx.clip();
    ctx.fillStyle = look.speckle;
    for (let i = 0; i < 40; i++) {
      const x = (((i * 37) % 100) / 100 - 0.5) * ext * 2;
      const y = (((i * 61 + 13) % 100) / 100 - 0.5) * ext * 2;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + (i % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // カドだらけ：面の切りかえ線
  if (s.type === 'polygon' && look.facet) {
    const th = (Math.PI * 2) / s.sides;
    ctx.strokeStyle = look.facet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < s.sides; i++) {
      const a = th / 2 + i * th;
      const x = Math.cos(a) * s.radius * 0.55;
      const y = Math.sin(a) * s.radius * 0.55;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    for (let i = 0; i < s.sides; i++) {
      const a = th / 2 + i * th;
      ctx.moveTo(Math.cos(a) * s.radius * 0.55, Math.sin(a) * s.radius * 0.55);
      ctx.lineTo(Math.cos(a) * s.radius, Math.sin(a) * s.radius);
    }
    ctx.stroke();
  }

  // ねりけし：こねたあとのしわ
  if (blob) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-s.radius * 0.2, -s.radius * 0.1, s.radius * 0.45, 0.4, 2.2);
    ctx.moveTo(s.radius * 0.5, s.radius * 0.1);
    ctx.arc(s.radius * 0.15, s.radius * 0.25, s.radius * 0.35, -0.2, 1.4);
    ctx.stroke();
  }

  // 紙ケース（長方形のときだけ）
  if (look.sleeve && s.type === 'rect') {
    ctx.save();
    shapePath(ctx, s);
    ctx.clip();
    const long = s.w >= s.h;
    const bw = (long ? s.w : s.h) * (look.sleeveRatio ?? 0.58);
    ctx.fillStyle = look.sleeve;
    if (long) ctx.fillRect(-bw / 2, -s.h / 2 - 2, bw, s.h + 4);
    else ctx.fillRect(-s.w / 2 - 2, -bw / 2, s.w + 4, bw);
    // ケースのふちの線
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    if (long) {
      ctx.fillRect(-bw / 2, -s.h / 2, 2, s.h);
      ctx.fillRect(bw / 2 - 2, -s.h / 2, 2, s.h);
    }
    if (look.sleeveText) {
      const fs = Math.min(s.w, s.h) * 0.32;
      ctx.fillStyle = look.sleeveTextColor || 'rgba(255,255,255,0.95)';
      ctx.font = `800 ${fs}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!long) ctx.rotate(Math.PI / 2);
      ctx.fillText(look.sleeveText, 0, 1, bw * 0.86);
    }
    ctx.restore();
  }

  // チビケシ：使いこんだよごれ
  if (look.smudge) {
    ctx.save();
    shapePath(ctx, s);
    ctx.clip();
    ctx.fillStyle = 'rgba(90,90,100,0.18)';
    for (const [x, y, r] of [[-ext * 0.4, -2, 6], [ext * 0.3, 4, 5], [ext * 0.6, -5, 3]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // マトマール：まとまったカス（ぶつかるほど増える）
  if (look.crumbs) {
    const n = 2 + (tv ? tv.gathered : 0) * 2;
    ctx.fillStyle = 'rgba(120,130,150,0.75)';
    for (let i = 0; i < Math.min(n, 14); i++) {
      const a = i * 2.39;
      const r = ext * (0.55 + ((i * 13) % 10) / 30);
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.55, 3, 2, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // つや
  ctx.save();
  shapePath(ctx, s, 0, 0, blob);
  ctx.clip();
  const g = ctx.createLinearGradient(-ext, -ext, ext, ext);
  g.addColorStop(0, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = g;
  ctx.fillRect(-ext, -ext, ext * 2, ext * 2);
  ctx.restore();

  // りんかく
  shapePath(ctx, s, 0, 0, blob);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = look.outline || 'rgba(70, 50, 30, 0.4)';
  ctx.stroke();

  ctx.restore();
}

/** 選択画面などの小さなキャンバスに、消しゴムを1個ちょうどよく描く */
export function drawEraserPreview(canvas, def, angle = -0.18) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cw = canvas.clientWidth || canvas.width;
  const ch = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  // 一番大きい消しゴム（ジャンボ）が収まる倍率でそろえると、大きさのちがいがわかる
  const scale = Math.min(cw, ch * 1.6) / 110;
  drawEraser(ctx, def, cw / 2, ch / 2, angle, { scale });
}
