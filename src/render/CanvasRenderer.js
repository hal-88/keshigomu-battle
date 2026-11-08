// 対戦画面の描画（2D Canvas）。
// Game.getState() の中身を絵にするだけで、ルールには手を出さない。
// 3D にするときは、このファイルの代わりを作れば差し替えられる。

import { drawEraser, roundRectPath, shapePath } from './drawEraser.js';
import { deskSize, eraserExtent } from '../logic/geometry.js';

const WORLD_MARGIN = 70; // 机のまわりに見せる床の広さ

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.view = { cx: 0, cy: 0, scale: 1, rot: 0, swap: false };
    this.flip = false; // true：机を180度回して見せる（オンラインで、自分の席を画面の下にする）
    this.cam = { x: 0, y: 0, zoom: 1 }; // スロー演出のズーム
    this.effects = [];
    this.shakeUntil = 0;
    this.shakePower = 0;
  }

  /** 画面サイズが変わったら呼ぶ。縦長の画面では机を90度回して大きく見せる */
  resize(desk) {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);

    const ds = deskSize(desk);
    this.deskHalf = { x: ds.w / 2, y: ds.h / 2 };
    const ww = ds.w + WORLD_MARGIN * 2;
    const wh = ds.h + WORLD_MARGIN * 2;
    const portrait = rect.height > rect.width * 1.05;
    const swap = portrait && ds.w > ds.h; // 机を90度回す（たてとよこが入れかわる）
    const rot = (swap ? Math.PI / 2 : 0) + (this.flip ? Math.PI : 0);
    const vw = swap ? wh : ww;
    const vh = swap ? ww : wh;
    this.view = {
      cx: rect.width / 2,
      cy: rect.height / 2,
      scale: Math.min(rect.width / vw, rect.height / vh),
      rot,
      swap,
    };
  }

  setCamera(x, y, zoom) {
    this.cam = { x, y, zoom };
  }

  /**
   * 机の上の四角い範囲 (minX, minY)〜(maxX, maxY) がちょうど画面に入るカメラ。
   * 机の外が見えすぎないように、中心は机の中におさえる。
   */
  fitCamera(minX, minY, maxX, maxY, maxZoom = 2) {
    const { scale, swap } = this.view;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const sw = swap ? bh : bw; // 画面のよこ方向に並ぶ机の長さ
    const sh = swap ? bw : bh;
    const zoom = Math.max(1, Math.min(maxZoom, this.w / (sw * scale), this.h / (sh * scale)));
    // 画面に見える机の半分の大きさ
    const visX = (swap ? this.h : this.w) / (2 * scale * zoom);
    const visY = (swap ? this.w : this.h) / (2 * scale * zoom);
    const limX = Math.max(0, this.deskHalf.x + WORLD_MARGIN - visX);
    const limY = Math.max(0, this.deskHalf.y + WORLD_MARGIN - visY);
    const clamp = (v, l) => Math.max(-l, Math.min(l, v));
    return { x: clamp((minX + maxX) / 2, limX), y: clamp((minY + maxY) / 2, limY), zoom };
  }

  shake(ms, power = 6) {
    this.shakeUntil = performance.now() + ms;
    this.shakePower = power;
  }

  /** 演出を足す。type: burst（ぶつかった火花）/ ring（広がる輪）/ text（文字や絵文字がうかぶ） */
  addEffect(fx) {
    this.effects.push({ start: performance.now(), ...fx });
  }

  get zoomScale() {
    return this.view.scale * this.cam.zoom;
  }

  worldToScreen(x, y) {
    const { cx, cy, rot } = this.view;
    const z = this.zoomScale;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const dx = x - this.cam.x;
    const dy = y - this.cam.y;
    return { x: cx + (dx * c - dy * s) * z, y: cy + (dx * s + dy * c) * z };
  }

  screenToWorld(sx, sy) {
    const { cx, cy } = this.view;
    const d = this.screenDeltaToWorld(sx - cx, sy - cy);
    return { x: d.x + this.cam.x, y: d.y + this.cam.y };
  }

  /** 画面上のずれ（px）を、机の上のずれに直す */
  screenDeltaToWorld(dx, dy) {
    const { rot } = this.view;
    const z = this.zoomScale;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return { x: (dx * c + dy * s) / z, y: (-dx * s + dy * c) / z };
  }

  /**
   * @param state     Game.getState()
   * @param aim       引っぱり中の矢印 { playerIndex, dirX, dirY, strength, spin }
   * @param now       performance.now()
   * @param placement カードで置く場所のプレビュー { kind, x, y, angle, ok, def, size, params }
   * @param targets   カードで相手をえらぶとき、えらべる人の番号
   */
  draw(state, aim, now, placement = null, targets = null) {
    const ctx = this.ctx;
    this._state = state; // とうめいの 見え方に つかう
    const { cx, cy, rot } = this.view;
    const z = this.zoomScale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._drawFloor(ctx);

    let sx = 0;
    let sy = 0;
    if (now < this.shakeUntil) {
      sx = (Math.random() - 0.5) * 2 * this.shakePower;
      sy = (Math.random() - 0.5) * 2 * this.shakePower;
    }

    ctx.save();
    ctx.translate(cx + sx, cy + sy);
    ctx.rotate(rot);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);

    // 落ちていくものは机より下にあるので、机より先に描く（机のふちに隠れる）
    for (const pc of state.pencils) {
      if (pc.alive) continue;
      ctx.save();
      ctx.globalAlpha = 1 - pc.fallProgress;
      this._drawPencil(ctx, pc.x, pc.y, pc.angle, pc.length, pc.width, 1 - 0.4 * pc.fallProgress, pc.look, pc.color);
      ctx.restore();
    }
    for (const e of [...state.erasers, ...state.debris]) {
      if (e.alive || e.fallProgress >= 1) continue;
      const p = e.fallProgress;
      drawEraser(ctx, e.def, e.x, e.y, e.angle, { scale: e.size * (1 - 0.55 * p), alpha: 1 - p, shadow: false, tv: e.trait });
    }
    for (const j of state.junk || []) {
      if (j.alive || j.fallProgress >= 1) continue;
      this._drawJunk(ctx, j, 1 - 0.55 * j.fallProgress, 1 - j.fallProgress);
    }

    this._drawDesk(ctx, state.desk);
    for (const zone of state.waxZones) this._drawWax(ctx, zone, now);
    if (state.tilt) this._drawTilt(ctx, state, now);
    if (state.blackHole) this._drawBlackHole(ctx, state.blackHole, now);
    if (state.pendingShrink) this._drawShrinkWarning(ctx, state.desk, state.pendingShrink, now);

    // 自分のばんの消しゴムの下に光る輪（分かれたパカッターは、どっちも弾けるので両方）
    const cur = state.erasers[state.turnIndex];
    if (state.phase === 'aim' && cur && cur.alive) {
      const color = state.players[cur.playerIndex].color;
      const pulse = 0.5 + 0.5 * Math.sin(now / 220);
      const mine = [cur, ...state.extras.filter((x) => x.playerIndex === cur.playerIndex)];
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.25 * pulse;
      ctx.fillStyle = color;
      for (const m of mine) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, eraserExtent(m.def) * m.size + 10 + pulse * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const pc of state.pencils) {
      if (pc.alive) this._drawPencil(ctx, pc.x, pc.y, pc.angle, pc.length, pc.width, 1, pc.look, pc.color);
    }
    for (const j of state.junk || []) if (j.alive) this._drawJunk(ctx, j, 1, 1);

    for (const e of [...state.erasers, ...state.extras]) {
      if (!e.alive) continue;
      if (e.effects.anchor) this._drawAnchorShadow(ctx, e);
      // ブルブル：いつも少しふるえている
      const jx = e.trait.vibrating ? Math.sin(now / 23 + e.playerIndex) * 0.9 : 0;
      const jy = e.trait.vibrating ? Math.cos(now / 29 + e.playerIndex) * 0.9 : 0;
      // クリアン：すけすけのときは 完全に見えない／イロカワール：机の色に とけこむ／とうめい（カード）
      if (this._hidden(e)) continue;
      let alpha = e.trait.clear ? e.trait.clearAlpha : 1;
      if (e.effects.invisible) alpha = Math.min(alpha, 0.4);
      if (state.seatMoved?.includes(e.pid)) alpha = Math.min(alpha, 0.25); // せきがえで 場所を決めたもの
      // ジャンプ中：空中なので 大きく見えて、かげが はなれる
      const air = e.effects.airborne ? 1.25 : 1;
      if (air > 1) this._drawAirShadow(ctx, e);
      drawEraser(ctx, e.def, e.x + jx, e.y + jy, e.angle, { scale: e.size * air, alpha, tv: e.trait, shadow: !e.trait.clear && air === 1 });
      if (e.effects.shield) this._drawShield(ctx, e, now);
      if (e.trait.clear && e.trait.camo) this._drawCamo(ctx, e, state.desk);
      // 分かれたかけらには、持ち主の色の輪
      if (e.isExtra) this._drawPieceRing(ctx, e, state.players[e.playerIndex].color);
      if (e.effects.hold) this._drawHoldRing(ctx, e, now);
    }

    if (targets) this._drawTargets(ctx, state, targets, now);
    if (aim) this._drawAimArrow(ctx, state, aim);
    if (placement) this._drawPlacement(ctx, placement, state, now);
    this._drawWorldEffects(ctx, now);

    ctx.restore();

    if (state.blackout) this._drawBlackout(ctx, state, now);
    this._drawLabels(ctx, state, now);
    this._drawScreenEffects(ctx, now);
    if (state.desk.autoCamera && this.cam.zoom > 1.1 && !state.blackout) this._drawMinimap(ctx, state);
    if (aim) this._drawGauge(ctx, aim);
  }

  _drawFloor(ctx) {
    ctx.fillStyle = '#a7b3bf';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const t = 64 * this.cam.zoom;
    const o = this.worldToScreen(0, 0);
    for (let x = ((o.x % t) + t) % t; x < this.w; x += t) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, this.h);
    }
    for (let y = ((o.y % t) + t) % t; y < this.h; y += t) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(this.w, y + 0.5);
    }
    ctx.stroke();
  }

  // 机の形のパスを足す（beginPath はしない）
  _addDeskPath(ctx, shape, ox = 0, oy = 0, grow = 0) {
    if (shape.type === 'circle') {
      ctx.moveTo(ox + shape.radius + grow, oy);
      ctx.arc(ox, oy, shape.radius + grow, 0, Math.PI * 2);
    } else {
      const r = Math.min(10, shape.w / 2, shape.h / 2);
      roundRectPath(ctx, -shape.w / 2 + ox - grow, -shape.h / 2 + oy - grow, shape.w + grow * 2, shape.h + grow * 2, r);
    }
  }

  _deskPath(ctx, shape, ox = 0, oy = 0, grow = 0) {
    ctx.beginPath();
    this._addDeskPath(ctx, shape, ox, oy, grow);
  }

  /** 見えなくなっている消しゴム（クリアンの すけすけ） */
  _hidden(e) {
    if (e.trait?.clear && !e.trait.camo && (e.trait.clearAlpha ?? 0.3) <= 0.01) return true;
    // とうめい（カード）：見ている人が 持ち主なら うすく見える。みんなで1台なら 持ち主の番だけ 見える
    if (e.effects?.invisible) {
      const st = this._state || {};
      if (st.viewer === e.playerIndex) return false;
      if (!st.online && st.turnIndex === e.playerIndex) return false;
      return true;
    }
    return false;
  }

  // イロカワール：机の色を うすく かさねて、とけこんで見えるようにする
  _drawCamo(ctx, e, desk) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.scale(e.size, e.size);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = desk.look.top;
    shapePath(ctx, e.def.shape);
    ctx.fill();
    ctx.restore();
  }

  _drawDesk(ctx, desk) {
    const L = desk.look;
    const shape = desk.shape;
    const { w, h } = deskSize(desk);

    // 床に落ちるかげ
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    this._deskPath(ctx, shape, 12, 18);
    ctx.fill();
    // 机の厚み
    ctx.fillStyle = L.edge;
    this._deskPath(ctx, shape, 0, 9);
    ctx.fill();
    // 天板
    ctx.fillStyle = L.top;
    this._deskPath(ctx, shape);
    ctx.fill();

    ctx.save();
    this._deskPath(ctx, shape);
    ctx.clip();
    if (L.style === 'steel') {
      // 給食台：細いすじ
      ctx.strokeStyle = L.grain;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let y = -h / 2; y < h / 2; y += 6) {
        ctx.moveTo(-w / 2, y);
        ctx.lineTo(w / 2, y);
      }
      ctx.stroke();
    } else {
      // 木目
      ctx.strokeStyle = L.grain;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55;
      const n = Math.max(6, Math.round(h / 30));
      for (let i = 0; i < n; i++) {
        const y0 = -h / 2 + ((i + 0.5) * h) / n;
        ctx.beginPath();
        ctx.moveTo(-w / 2, y0 + Math.sin(i * 2.3) * 5);
        ctx.bezierCurveTo(
          -w / 6, y0 + Math.sin(i * 1.3) * 9,
          w / 6, y0 + Math.cos(i * 1.9) * 9,
          w / 2, y0 + Math.sin(i * 0.7) * 5,
        );
        ctx.stroke();
      }
    }
    if (L.style === 'night') {
      // よるの教室：まどからの 月あかりと、ほこりの つぶ
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(-w * 0.3, -h * 0.4, 10, -w * 0.3, -h * 0.4, w * 0.8);
      g.addColorStop(0, 'rgba(180,200,255,0.25)');
      g.addColorStop(1, 'rgba(0,0,20,0.25)');
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = 'rgba(220,230,255,0.35)';
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.arc(-w / 2 + ((i * 97) % w), -h / 2 + ((i * 61) % h), 1 + (i % 3) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (L.style === 'wax') {
      // ワックス机：ななめのつや
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        const x = i * 130;
        ctx.moveTo(x - 40, -h / 2);
        ctx.lineTo(x + 10, -h / 2);
        ctx.lineTo(x + 10 - h * 0.6, h / 2);
        ctx.lineTo(x - 40 - h * 0.6, h / 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // ふちのハイライト
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    this._deskPath(ctx, shape, 0, 0, -3);
    ctx.stroke();
  }

  // サドンデス：けずれる部分を赤く点滅
  _drawShrinkWarning(ctx, desk, next, now) {
    const blink = 0.5 + 0.5 * Math.sin(now / 130);
    ctx.save();
    ctx.beginPath();
    this._addDeskPath(ctx, desk.shape);
    this._addDeskPath(ctx, next);
    ctx.fillStyle = `rgba(230, 40, 40, ${0.18 + 0.32 * blink})`;
    ctx.fill('evenodd');
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(200, 20, 20, ${0.5 + 0.5 * blink})`;
    this._deskPath(ctx, next);
    ctx.stroke();
    ctx.restore();
  }

  _drawWax(ctx, z, now) {
    if (z.kind === 'ice') return this._drawIce(ctx, z, now);
    if (z.kind === 'crumbs' || (z.scale && z.scale > 1)) return this._drawCrumbs(ctx, z);
    ctx.save();
    const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    g.addColorStop(0, 'rgba(255,255,255,0.65)');
    g.addColorStop(0.7, 'rgba(220,240,255,0.35)');
    g.addColorStop(1, 'rgba(200,230,255,0.08)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(120,170,220,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    // キラキラ
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4 + 0.7;
      const r = z.r * (0.25 + ((i * 37) % 60) / 100);
      const tw = 0.5 + 0.5 * Math.sin(now / 300 + i * 1.7);
      this._sparkle(ctx, z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, 4 + 5 * tw, `rgba(255,255,255,${0.4 + 0.6 * tw})`);
    }
    ctx.restore();
  }

  // けしくず：消しカスが ちらばっている
  _drawCrumbs(ctx, z) {
    ctx.save();
    ctx.fillStyle = 'rgba(120,90,60,0.12)';
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = 'rgba(120,90,60,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 34; i++) {
      const a = i * 2.39996;
      const r = z.r * Math.sqrt(((i * 37) % 100) / 100);
      const x = z.x + Math.cos(a) * r;
      const y = z.y + Math.sin(a) * r;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(i * 1.7);
      ctx.fillStyle = i % 3 ? 'rgba(235,225,215,0.95)' : 'rgba(150,140,130,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.5 + (i % 3), 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // かたむき：ひくいほうへ 矢印
  _drawTilt(ctx, state, now) {
    const t = state.tilt;
    const { w, h } = deskSize(state.desk);
    const a = Math.atan2(t.y, t.x);
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.08 * Math.sin(now / 250);
    ctx.fillStyle = '#1e3a8a';
    const step = 150;
    for (let gx = -w / 2 + step / 2; gx < w / 2; gx += step) {
      for (let gy = -h / 2 + step / 2; gy < h / 2; gy += step) {
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(a);
        const off = ((now / 25) % 30) - 15;
        ctx.beginPath();
        ctx.moveTo(off - 14, -16);
        ctx.lineTo(off + 10, 0);
        ctx.lineTo(off - 14, 16);
        ctx.lineTo(off - 6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ブラックホール：まんなかの あな
  _drawBlackHole(ctx, bh, now) {
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -now / 40;
    ctx.strokeStyle = 'rgba(80,40,160,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, bh.R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const g = ctx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, bh.r * 2.6);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.38, 'rgba(10,0,30,0.95)');
    g.addColorStop(0.6, 'rgba(90,40,180,0.5)');
    g.addColorStop(1, 'rgba(90,40,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bh.x, bh.y, bh.r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // うずまき
    ctx.strokeStyle = 'rgba(180,140,255,0.6)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const r = bh.r * 2.4 * (1 - i / 30);
        const a = (i / 30) * Math.PI * 2.5 + (k * Math.PI * 2) / 3 + now / 300;
        const x = bh.x + Math.cos(a) * r;
        const y = bh.y + Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ふでばこ：まわりを かこむ 青い箱
  _drawShield(ctx, e, now) {
    const r = eraserExtent(e.def) * e.size + 9;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.globalAlpha = 0.75 + 0.2 * Math.sin(now / 200);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    roundRectPath(ctx, -r * 1.15, -r * 0.8, r * 2.3, r * 1.6, 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    roundRectPath(ctx, -r * 1.15 + 4, -r * 0.8 + 4, r * 2.3 - 8, r * 1.6 - 8, 6);
    ctx.stroke();
    ctx.restore();
  }

  // ジャンプ中の かげ（地面に はなれて うつる）
  _drawAirShadow(ctx, e) {
    ctx.save();
    ctx.fillStyle = 'rgba(40,25,10,0.22)';
    ctx.beginPath();
    ctx.ellipse(e.x + 10, e.y + 16, eraserExtent(e.def) * e.size * 0.9, eraserExtent(e.def) * e.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ていでん：画面が まっくら（弾く人のまわりだけ すこし見える。光る消しゴムは 光る）
  _drawBlackout(ctx, state, now) {
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,20,0.9)';
    ctx.beginPath();
    ctx.rect(0, 0, this.w, this.h);
    const cur = state.erasers[state.turnIndex];
    if (cur && cur.alive) {
      const p = this.worldToScreen(cur.x, cur.y);
      const r = (eraserExtent(cur.def) * cur.size + 30) * this.zoomScale;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2, true);
    }
    ctx.fill('evenodd');
    // 光る消しゴム（ヒカルン）は くらくても 見える
    for (const e of [...state.erasers, ...state.extras]) {
      if (!e.alive || !e.trait?.glowing) continue;
      const p = this.worldToScreen(e.x, e.y);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40 * this.zoomScale);
      g.addColorStop(0, 'rgba(180,255,120,0.9)');
      g.addColorStop(1, 'rgba(118,255,3,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 40 * this.zoomScale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,240,180,0.85)';
    ctx.font = '800 16px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔌 停電中…', this.w / 2, 70 + Math.sin(now / 300) * 3);
    ctx.restore();
  }

  // アイスケシの こおりの道
  _drawIce(ctx, z, now) {
    ctx.save();
    const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    g.addColorStop(0, 'rgba(225,245,255,0.75)');
    g.addColorStop(0.75, 'rgba(160,215,255,0.45)');
    g.addColorStop(1, 'rgba(160,215,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
    const tw = 0.5 + 0.5 * Math.sin(now / 350 + z.x);
    this._sparkle(ctx, z.x + z.r * 0.25, z.y - z.r * 0.2, 3 + 3 * tw, 'rgba(255,255,255,' + (0.5 + 0.5 * tw) + ')');
    ctx.restore();
  }

  _sparkle(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y);
    ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y);
    ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.fill();
  }

  // ブロッケンが のこした ブロックの壁
  _drawBlock(ctx, x, y, angle, L, W, scale, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(50,30,10,0.25)';
    ctx.fillRect(-L / 2 + 3, -W / 2 + 5, L, W);
    ctx.fillStyle = color || '#42a5f5';
    ctx.beginPath();
    roundRectPath(ctx, -L / 2, -W / 2, L, W, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        const cx = -L / 2 + (L / 4) * (i + 0.5);
        const cy = -W / 2 + (W / 2) * (j + 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.arc(cx + 1, cy + 1.5, W * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(cx, cy, W * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 外れたパーツ（ガッタイン）・カバー（ガードン）・ネタ（スシケシ）・から（タマゴン）
  _drawJunk(ctx, j, scale, alpha) {
    const { w, h } = j;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(j.x, j.y);
    ctx.rotate(j.angle);
    ctx.scale(scale, scale);
    if (alpha >= 1) {
      ctx.fillStyle = 'rgba(50,30,10,0.22)';
      ctx.beginPath();
      roundRectPath(ctx, -w / 2 + 2, -h / 2 + 3, w, h, 3);
      ctx.fill();
    }
    ctx.fillStyle = j.color;
    ctx.beginPath();
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-w / 2 + 2, -h / 2 + 1.5, w - 4, Math.max(1.5, h * 0.2));
    if (j.kind === 'neta') {
      // サーモンの しま
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * w * 0.17 - 3, -h / 2 + 2);
        ctx.lineTo(i * w * 0.17 + 2, h / 2 - 2);
        ctx.stroke();
      }
    } else if (j.kind === 'shell') {
      // たまごの から（ギザギザ）
      ctx.strokeStyle = 'rgba(120,100,60,0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx.lineTo(-w / 2 + (i * w) / 6, i % 2 ? -h / 4 : h / 4);
      ctx.stroke();
    } else if (j.kind === 'cover') {
      // カバーの口（中がからっぽ）
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(w / 2 - 4, -h / 2 + 2, 2, h - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `800 ${h * 0.55}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ガード', -2, 1, w * 0.75);
    } else {
      // パーツのつなぎ目のポッチ
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      const r = Math.min(w, h) * 0.18;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawPencil(ctx, x, y, angle, L, W, scale = 1, look = 'pencil', color = null) {
    if (look === 'ruler') return this._drawRuler(ctx, x, y, angle, L, W, scale);
    if (look === 'block') return this._drawBlock(ctx, x, y, angle, L, W, scale, color);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    const hl = L / 2;
    const hw = W / 2;
    // かげ
    ctx.fillStyle = 'rgba(50,30,10,0.25)';
    ctx.fillRect(-hl + 3, -hw + 5, L, W);
    // 消しゴム側（ピンク＋金具）
    ctx.fillStyle = '#f48fb1';
    ctx.beginPath();
    roundRectPath(ctx, -hl, -hw, 14, W, 4);
    ctx.fill();
    ctx.fillStyle = '#c9ccd1';
    ctx.fillRect(-hl + 11, -hw, 12, W);
    // 軸
    ctx.fillStyle = '#f6c445';
    ctx.fillRect(-hl + 23, -hw, L - 23 - 26, W);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-hl + 23, -hw + 2, L - 23 - 26, W * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(-hl + 23, hw - W * 0.3, L - 23 - 26, W * 0.3);
    // けずったところ
    ctx.fillStyle = '#f2d2a0';
    ctx.beginPath();
    ctx.moveTo(hl - 26, -hw);
    ctx.lineTo(hl, 0);
    ctx.lineTo(hl - 26, hw);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(hl - 9, -hw * 0.35);
    ctx.lineTo(hl, 0);
    ctx.lineTo(hl - 9, hw * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 相手をえらぶとき：えらべる消しゴムに、ねらいのマーク
  _drawTargets(ctx, state, targets, now) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    for (const i of targets) {
      const e = state.erasers[i];
      if (!e || !e.alive) continue;
      const r = eraserExtent(e.def) * e.size + 14 + pulse * 5;
      ctx.save();
      ctx.strokeStyle = state.players[i].color;
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -now / 40;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        ctx.moveTo(e.x + Math.cos(a) * (r - 6), e.y + Math.sin(a) * (r - 6));
        ctx.lineTo(e.x + Math.cos(a) * (r + 8), e.y + Math.sin(a) * (r + 8));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // じょうぎ：すけた板に目もり
  _drawRuler(ctx, x, y, angle, L, W, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    const hl = L / 2;
    const hw = W / 2;
    ctx.fillStyle = 'rgba(50,30,10,0.18)';
    ctx.fillRect(-hl + 3, -hw + 5, L, W);
    ctx.fillStyle = 'rgba(190, 230, 255, 0.85)';
    ctx.beginPath();
    roundRectPath(ctx, -hl, -hw, L, W, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 120, 170, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i * 10 <= L - 8; i++) {
      const tx = -hl + 4 + i * 10;
      const len = i % 5 === 0 ? W * 0.55 : W * 0.3;
      ctx.moveTo(tx, -hw);
      ctx.lineTo(tx, -hw + len);
    }
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  _drawPieceRing(ctx, e, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, eraserExtent(e.def) * e.size + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawAnchorShadow(ctx, e) {
    ctx.save();
    ctx.strokeStyle = 'rgba(60,60,70,0.7)';
    ctx.lineWidth = 4;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, eraserExtent(e.def) * e.size + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawHoldRing(ctx, e, now) {
    ctx.save();
    ctx.strokeStyle = `rgba(80,180,255,${0.5 + 0.3 * Math.sin(now / 180)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, eraserExtent(e.def) * e.size + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _strengthColor(s) {
    return `hsl(${120 - 120 * s}, 80%, 46%)`;
  }

  // 矢印。回転がかかると曲がった矢印になる
  _drawAimArrow(ctx, state, aim) {
    const e = state.erasers[aim.playerIndex];
    const len = Math.hypot(aim.dirX, aim.dirY);
    if (!e || !e.alive || len < 1e-6 || aim.strength <= 0) return;

    const start = eraserExtent(e.def) * e.size + 10;
    const L = 30 + aim.strength * 220;
    const spin = aim.spin || 0;
    const p0 = { x: start, y: 0 };
    const p1 = { x: start + L * 0.6, y: 0 };
    const p2 = { x: start + L, y: spin * L * 0.35 };
    const ta = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const head = 24;
    const end = { x: p2.x - Math.cos(ta) * head * 0.7, y: p2.y - Math.sin(ta) * head * 0.7 };
    const color = this._strengthColor(aim.strength);

    ctx.save();
    ctx.translate(e.x, e.y);
    const wobble = state.glare ? Math.sin(performance.now() / 70) * state.glare * 0.9 : 0; // キラリンで まぶしい
    ctx.rotate(Math.atan2(aim.dirY, aim.dirX) + wobble);
    ctx.globalAlpha = 0.92;
    ctx.lineCap = 'round';
    for (const [lw, col] of [[18, 'white'], [11, color]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(p1.x, p1.y, end.x, end.y);
      ctx.stroke();
    }
    ctx.translate(p2.x, p2.y);
    ctx.rotate(ta);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-head, -16);
    ctx.lineTo(-head, 16);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'white';
    ctx.stroke();
    ctx.restore();
  }

  _drawPlacement(ctx, pl, state, now) {
    const okColor = pl.ok ? 'rgba(40,190,90,0.9)' : 'rgba(230,50,50,0.9)';
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.2 * Math.sin(now / 150);
    if (pl.kind === 'eraser') {
      for (const c of pl.chosen || []) {
        drawEraser(ctx, c.def, c.x, c.y, c.angle || 0, { scale: c.size || 1, shadow: false, alpha: 0.85 });
      }
      if (pl.chosenOnly) {
        ctx.restore();
        return;
      }
      drawEraser(ctx, pl.def, pl.x, pl.y, pl.angle || 0, { scale: pl.size || 1, shadow: false });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = okColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, eraserExtent(pl.def) * (pl.size || 1) + 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pl.kind === 'pencil') {
      this._drawPencil(ctx, pl.x, pl.y, pl.angle || 0, pl.params.length, pl.params.width, 1, pl.params.look);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = okColor;
      ctx.lineWidth = 3;
      ctx.save();
      ctx.translate(pl.x, pl.y);
      ctx.rotate(pl.angle || 0);
      ctx.strokeRect(-pl.params.length / 2 - 4, -pl.params.width / 2 - 4, pl.params.length + 8, pl.params.width + 8);
      ctx.restore();
    } else if (pl.kind === 'circle') {
      this._drawWax(ctx, { x: pl.x, y: pl.y, r: pl.params.radius }, now);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = okColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, pl.params.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawWorldEffects(ctx, now) {
    for (const fx of this.effects) {
      const t = (now - fx.start) / (fx.dur || 400);
      if (t < 0 || t > 1) continue;
      ctx.save();
      if (fx.type === 'burst') {
        const n = 8;
        const r0 = 6 + t * 14;
        const r1 = r0 + 6 + (fx.power || 5) * 1.2 * (1 - t);
        ctx.strokeStyle = fx.color || '#fff';
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + fx.x * 0.01;
          ctx.moveTo(fx.x + Math.cos(a) * r0, fx.y + Math.sin(a) * r0);
          ctx.lineTo(fx.x + Math.cos(a) * r1, fx.y + Math.sin(a) * r1);
        }
        ctx.stroke();
      } else if (fx.type === 'ring') {
        ctx.strokeStyle = fx.color || '#fff';
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 6 * (1 - t) + 1;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, (fx.r || 20) + t * (fx.grow || 60), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 文字や絵文字の演出は、画面がまわっていてもまっすぐ見えるように画面の座標で描く
  _drawScreenEffects(ctx, now) {
    this.effects = this.effects.filter((fx) => now - fx.start < (fx.dur || 400));
    for (const fx of this.effects) {
      if (fx.type !== 'text') continue;
      const t = (now - fx.start) / (fx.dur || 1200);
      const p = this.worldToScreen(fx.x, fx.y);
      ctx.save();
      ctx.globalAlpha = t < 0.8 ? 1 : (1 - t) / 0.2;
      const pop = t < 0.15 ? 0.5 + (t / 0.15) * 0.7 : 1.2 - Math.min(0.2, (t - 0.15) * 0.5);
      ctx.font = `800 ${(fx.size || 34) * pop}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const y = p.y - 30 - t * 40;
      if (fx.stroke) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeText(fx.text, p.x, y);
      }
      ctx.fillStyle = fx.color || '#fff';
      ctx.fillText(fx.text, p.x, y);
      ctx.restore();
    }
  }

  _drawLabels(ctx, state, now) {
    const z = this.zoomScale;
    ctx.font = '800 13px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of state.erasers) {
      if (!e.alive || this._hidden(e)) continue;
      if (state.blackout && e.playerIndex !== state.turnIndex) continue;
      const player = state.players[e.playerIndex];
      const p = this.worldToScreen(e.x, e.y);
      const isTurn = state.phase === 'aim' && state.turnIndex === e.playerIndex;
      const bob = isTurn ? Math.sin(now / 200) * 3 : 0;
      const y = p.y - eraserExtent(e.def) * e.size * z - 18 + bob;
      let text = player.name;
      if (e.effects.big) text += ' 🐘';
      if (e.effects.mini) text += ' 🐜';
      if (e.effects.grip) text += ' 🧤';
      if (e.effects.confused) text += ' 🍓混乱';
      if (e.effects.clear && !e.trait.camo) text += ' 👻';
      if (e.trait.dice) text += ' 🎲' + e.trait.dice;
      if (e.trait.charging) text += ' 💤ためる';
      if (e.effects.invisible) text += ' 🌫️';
      if (e.effects.shield) text += ' 🛡️';
      if (e.effects.extraLife) text += ' 🔁';
      if (e.effects.reversed) text += ' 🔃逆さま';
      if (e.effects.power) text += ' 🔋';
      if (e.trait.happy) text += ' 💮';
      if (e.effects.anchor) text += ' ⚓';
      if (e.effects.hold) text += ' 🦶';
      const tw = ctx.measureText(text).width + 18;
      ctx.fillStyle = player.color;
      ctx.beginPath();
      roundRectPath(ctx, p.x - tw / 2, y - 11, tw, 22, 11);
      ctx.fill();
      if (isTurn) {
        ctx.beginPath();
        ctx.moveTo(p.x - 6, y + 10);
        ctx.lineTo(p.x + 6, y + 10);
        ctx.lineTo(p.x, y + 17);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'white';
      ctx.fillText(text, p.x, y + 1);
    }
  }

  // 大きい机でズームしているとき：右上に机ぜんたいの小さな地図
  _drawMinimap(ctx, state) {
    const { rot } = this.view;
    const ds = deskSize(state.desk);
    const sw = this.view.swap ? ds.h : ds.w; // 画面の向きでの机の大きさ
    const sh = this.view.swap ? ds.w : ds.h;
    const maxSide = Math.min(130, this.w * 0.3);
    const ms = maxSide / Math.max(sw, sh);
    const mw = sw * ms;
    const mh = sh * ms;
    const x0 = this.w - mw - 12;
    const y0 = 12;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    roundRectPath(ctx, x0 - 6, y0 - 6, mw + 12, mh + 12, 10);
    ctx.fill();
    ctx.translate(x0 + mw / 2, y0 + mh / 2);
    ctx.rotate(rot);
    ctx.scale(ms, ms);
    // 机
    ctx.fillStyle = state.desk.look.top;
    this._deskPath(ctx, state.desk.shape);
    ctx.fill();
    if (state.pendingShrink) {
      ctx.beginPath();
      this._addDeskPath(ctx, state.desk.shape);
      this._addDeskPath(ctx, state.pendingShrink);
      ctx.fillStyle = 'rgba(230,40,40,0.5)';
      ctx.fill('evenodd');
    }
    // 消しゴム
    for (const e of [...state.erasers, ...state.extras]) {
      if (!e.alive || this._hidden(e)) continue;
      ctx.fillStyle = state.players[e.playerIndex].color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(22, eraserExtent(e.def) * e.size), 0, Math.PI * 2);
      ctx.fill();
    }
    // いま見えているところ
    const z = this.zoomScale;
    const hx = (this.view.swap ? this.h : this.w) / (2 * z);
    const hy = (this.view.swap ? this.w : this.h) / (2 * z);
    ctx.strokeStyle = 'rgba(40,40,60,0.8)';
    ctx.lineWidth = 2 / ms;
    ctx.strokeRect(this.cam.x - hx, this.cam.y - hy, hx * 2, hy * 2);
    ctx.restore();
  }

  _drawGauge(ctx, aim) {
    if (aim.strength <= 0) return;
    const bw = Math.min(260, this.w * 0.6);
    const bh = 16;
    const x = (this.w - bw) / 2;
    const y = this.h - 30;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    roundRectPath(ctx, x - 3, y - 3, bw + 6, bh + 6, 11);
    ctx.fill();
    ctx.fillStyle = this._strengthColor(aim.strength);
    ctx.beginPath();
    roundRectPath(ctx, x, y, Math.max(bh, bw * aim.strength), bh, 8);
    ctx.fill();
    ctx.font = '800 13px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'white';
    let label = aim.strength >= 1 ? '強さ MAX！' : '強さ';
    if (Math.abs(aim.spin || 0) > 0.01) label += '　回転 ' + (aim.spin > 0 ? '↻' : '↺');
    ctx.fillText(label, this.w / 2, y - 6);
  }
}
