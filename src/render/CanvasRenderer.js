// 対戦画面の描画（2D Canvas）。
// Game.getState() の中身を絵にするだけで、ルールには手を出さない。
// 3D にするときは、このファイルの代わりを作れば差し替えられる。

import { drawEraser, roundRectPath, shapePath, drawKira } from './drawEraser.js';
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
    this._drawStageUnder(ctx, state.desk.features);
    for (const zone of state.waxZones) this._drawWax(ctx, zone, now);
    for (const p of state.posts || []) this._drawPost(ctx, p);
    // ペタン：ねらっている間は「まんなか ボーナス」の 輪を 見せる
    {
      const cur = state.erasers[state.turnIndex];
      if (state.phase === 'aim' && cur?.alive && cur.def.trait?.id === 'petanque') this._drawPetanqueRing(ctx, cur.def.trait.center ?? 95, now);
    }
    if (state.stuck) this._drawNattoThreads(ctx, state.stuck, now);
    if (state.bamboo) this._drawBamboo(ctx, state.bamboo, now);
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
      if (e.effects.inked) this._drawInk(ctx, e); // ハゴイタンの 墨で ×
      if (e.trait.clear && e.trait.camo) this._drawCamo(ctx, e, state.desk);
      // キラ（ガチャで 2回出た）は にじ色に 光る（見た目だけ）
      if (state.players[e.playerIndex]?.kira && alpha > 0.5) drawKira(ctx, e.def, e.x + jx, e.y + jy, e.angle, e.size * air, now);
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
    if (L.style === 'lab') {
      // 理科室：黒い天板の つや
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.06)');
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    if (L.style === 'old') {
      // 図工室：古い木の しみと きず
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(90,55,25,0.18)';
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.ellipse(-w / 2 + ((i * 173) % w), -h / 2 + ((i * 89) % h), 18 + (i % 4) * 8, 10 + (i % 3) * 5, i, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(70,40,15,0.3)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) {
        const x = -w / 2 + ((i * 131) % w);
        const y = -h / 2 + ((i * 71) % h);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 14 + (i % 5) * 4, y + ((i % 3) - 1) * 6);
        ctx.stroke();
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

  // ---- ステージの しかけ ----
  // みぞ・流し（消しゴムの下に かく）
  _drawStageUnder(ctx, f) {
    if (!f) return;
    ctx.save();
    for (const g of f.grooves || []) {
      // 彫刻刀の みぞ：こい線と、ふちの明るい線
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(70,40,15,0.55)';
      ctx.lineWidth = (g.width ?? 12) * 0.9;
      ctx.beginPath();
      ctx.moveTo(g.x1, g.y1);
      ctx.lineTo(g.x2, g.y2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,190,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.x1 + 3, g.y1 + 3);
      ctx.lineTo(g.x2 + 3, g.y2 + 3);
      ctx.stroke();
    }
    // ガス栓から ガスバーナーへの ゴムホース（机に ねているだけ。ぶつからない）
    const tap = (f.posts || []).find((p) => p.kind === 'tap');
    const burner = (f.posts || []).find((p) => p.kind === 'burner');
    if (tap && burner) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#c2410c';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(tap.x - 10, tap.y + 8);
      ctx.bezierCurveTo(tap.x - 70, tap.y + 60, burner.x + 70, burner.y - 70, burner.x + 14, burner.y - 4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,160,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (const h of f.holes || []) {
      // 流し：ステンレスの くぼみと はいすい口
      const x = h.x - h.w / 2;
      const y = h.y - h.h / 2;
      ctx.fillStyle = '#9aa5ae';
      this._roundRect(ctx, x - 5, y - 5, h.w + 10, h.h + 10, 10);
      ctx.fill();
      const g = ctx.createLinearGradient(x, y, x + h.w, y + h.h);
      g.addColorStop(0, '#4b5560');
      g.addColorStop(1, '#1d232a');
      ctx.fillStyle = g;
      this._roundRect(ctx, x, y, h.w, h.h, 8);
      ctx.fill();
      ctx.fillStyle = '#0b0e12';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7d8893';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 机の 置物（動かない じゃまもの）
  //  包丁は 机に ねている（上から見た絵）。ほかは 立っているので、横から見た絵を 画面の上むきに かく
  _drawPost(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.kind === 'knife') {
      ctx.rotate(p.angle || 0);
      this._drawKnife(ctx, p.w, p.h);
      ctx.restore();
      return;
    }
    ctx.rotate(-(this.view.rot || 0)); // 画面が回っていても 立って見えるように
    const r = p.r;
    // 机に落ちる かげ（ここが 当たる場所）
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(3, 3, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === 'burner') this._drawBurner(ctx, r);
    else if (p.kind === 'tap') this._drawGasTap(ctx, r);
    else if (p.kind === 'beaker') this._drawBeaker(ctx, r);
    else if (p.kind === 'flask') this._drawFlask(ctx, r);
    else {
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ガスバーナー：台・つつ・空気調節の輪・青いほのお
  _drawBurner(ctx, r) {
    // 台
    ctx.fillStyle = '#2f353d';
    ctx.beginPath();
    ctx.ellipse(0, 3, r * 1.05, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4b535e';
    ctx.beginPath();
    ctx.ellipse(0, -1, r * 1.05, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // つつ
    const top = -r * 2.3;
    const bw = r * 0.3;
    const g = ctx.createLinearGradient(-bw, 0, bw, 0);
    g.addColorStop(0, '#8d97a3');
    g.addColorStop(0.45, '#f1f4f7');
    g.addColorStop(1, '#6f7884');
    ctx.fillStyle = g;
    ctx.fillRect(-bw, top, bw * 2, -top);
    ctx.fillStyle = '#3a4048';
    ctx.beginPath();
    ctx.ellipse(0, top, bw, bw * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    // ガス調節ねじ・空気調節ねじ（金色の輪）
    ctx.fillStyle = '#c99a1e';
    ctx.fillRect(-bw * 1.35, -r * 0.75, bw * 2.7, r * 0.3);
    ctx.fillStyle = '#e6bd45';
    ctx.fillRect(-bw * 1.25, -r * 1.25, bw * 2.5, r * 0.3);
    // ゴムホースの口
    ctx.fillStyle = '#9aa3ad';
    ctx.fillRect(bw, -r * 0.4, r * 0.6, r * 0.22);
    // ほのお（ゆらゆら）
    const t = performance.now() / 120;
    const fh = r * (1.25 + 0.12 * Math.sin(t) + 0.06 * Math.sin(t * 2.3));
    const flame = (w, h, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-w, top - 1);
      ctx.quadraticCurveTo(-w * 1.1, top - h * 0.5, 0, top - h);
      ctx.quadraticCurveTo(w * 1.1, top - h * 0.5, w, top - 1);
      ctx.closePath();
      ctx.fill();
    };
    flame(bw * 1.05, fh, 'rgba(120,180,255,0.75)');
    flame(bw * 0.6, fh * 0.55, 'rgba(40,90,240,0.9)');
  }

  // ガス栓：金色の 本体と 黄色い コック
  _drawGasTap(ctx, r) {
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(-r * 0.9, -r * 0.35, r * 1.8, r * 0.5); // 台
    const g = ctx.createLinearGradient(-r * 0.5, 0, r * 0.5, 0);
    g.addColorStop(0, '#a77d14');
    g.addColorStop(0.45, '#f6d66a');
    g.addColorStop(1, '#8a6410');
    ctx.fillStyle = g;
    ctx.fillRect(-r * 0.45, -r * 1.7, r * 0.9, r * 1.45); // 本体
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.7, r * 0.45, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // ホースをつなぐ口（ななめ下）
    ctx.fillStyle = '#c9a227';
    ctx.save();
    ctx.translate(-r * 0.3, -r * 0.9);
    ctx.rotate(0.5);
    ctx.fillRect(-r * 1.1, -r * 0.14, r * 1.1, r * 0.28);
    ctx.restore();
    // コック（黄色いレバー）
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, -r * 0.3, -r * 2.15, r * 1.5, r * 0.4, r * 0.15);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.arc(0, -r * 1.95, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }

  // ビーカー：ガラスと 水色の 水・目もり
  _drawBeaker(ctx, r) {
    const top = -r * 2.1;
    const glass = () => {
      ctx.beginPath();
      ctx.moveTo(-r, top);
      ctx.lineTo(-r, -r * 0.2);
      ctx.quadraticCurveTo(-r, 0, -r * 0.8, 0);
      ctx.lineTo(r * 0.8, 0);
      ctx.quadraticCurveTo(r, 0, r, -r * 0.2);
      ctx.lineTo(r, top);
    };
    // 水
    const lv = top * 0.5;
    ctx.save();
    glass();
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(70,170,255,0.6)';
    ctx.fillRect(-r, lv, r * 2, -lv);
    ctx.fillStyle = 'rgba(150,215,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, lv, r, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // ガラス
    ctx.fillStyle = 'rgba(220,240,255,0.22)';
    glass();
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,225,0.95)';
    ctx.lineWidth = 2;
    glass();
    ctx.stroke();
    // 口（そそぎ口つき）
    ctx.beginPath();
    ctx.ellipse(0, top, r, r * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r, top);
    ctx.lineTo(-r * 1.25, top - r * 0.2);
    ctx.stroke();
    // 目もり
    ctx.lineWidth = 1.2;
    for (let i = 1; i <= 4; i++) {
      const y = top * (i / 5);
      ctx.beginPath();
      ctx.moveTo(r * 0.35, y);
      ctx.lineTo(r * (i % 2 ? 0.75 : 0.6), y);
      ctx.stroke();
    }
    // 光
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(-r * 0.75, top * 0.85, r * 0.15, -top * 0.6);
  }

  // 三角フラスコ：細い首と 緑の 液
  _drawFlask(ctx, r) {
    const nw = r * 0.3;
    const top = -r * 2.6;
    const neckEnd = -r * 1.75;
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(-nw, top);
      ctx.lineTo(-nw, neckEnd);
      ctx.lineTo(-r, -r * 0.18);
      ctx.quadraticCurveTo(-r * 1.02, 0, -r * 0.8, 0);
      ctx.lineTo(r * 0.8, 0);
      ctx.quadraticCurveTo(r * 1.02, 0, r, -r * 0.18);
      ctx.lineTo(nw, neckEnd);
      ctx.lineTo(nw, top);
    };
    // 液
    const lv = -r * 0.85;
    ctx.save();
    body();
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(60,200,120,0.65)';
    ctx.fillRect(-r * 1.1, lv, r * 2.2, -lv);
    ctx.fillStyle = 'rgba(150,240,180,0.85)';
    ctx.beginPath();
    ctx.ellipse(0, lv, r * 0.62, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // ガラス
    ctx.fillStyle = 'rgba(220,240,255,0.22)';
    body();
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,225,0.95)';
    ctx.lineWidth = 2;
    body();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, top, nw * 1.25, nw * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 光
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-nw * 0.4, top * 0.9);
    ctx.lineTo(-nw * 0.4, neckEnd);
    ctx.lineTo(-r * 0.6, -r * 0.45);
    ctx.stroke();
  }

  // 包丁（上から見た絵）。x の − がわが 持つところ
  _drawKnife(ctx, w, h) {
    const hl = w * 0.36; // 持つところの長さ
    const x0 = -w / 2;
    // かげ
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x0 + 3, -h / 2 + 4, w, h);
    // 持つところ
    ctx.fillStyle = '#5a3a22';
    this._roundRect(ctx, x0, -h * 0.32, hl, h * 0.64, h * 0.25);
    ctx.fill();
    ctx.fillStyle = '#d9d9d9';
    for (const k of [0.3, 0.7]) {
      ctx.beginPath();
      ctx.arc(x0 + hl * k, 0, h * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // つば
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(x0 + hl - 2, -h * 0.4, 5, h * 0.8);
    // 刃
    const bx = x0 + hl + 3;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#9aa4ae');
    g.addColorStop(0.5, '#f3f6f8');
    g.addColorStop(1, '#c4ccd3');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx, -h / 2);
    ctx.lineTo(w / 2 - h * 0.6, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h * 0.35);
    ctx.quadraticCurveTo(w / 2 - h * 0.8, h / 2, w / 2 - h * 2, h / 2);
    ctx.lineTo(bx, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,90,100,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 刃先の光
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(bx + 2, h / 2 - 1.5);
    ctx.lineTo(w / 2 - h * 2, h / 2 - 1.5);
    ctx.stroke();
  }

  _drawStageZone(ctx, z) {
    ctx.save();
    if (z.kind === 'gap') {
      // 机と机の すき間
      ctx.fillStyle = 'rgba(60,35,15,0.75)';
      ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
      ctx.fillStyle = 'rgba(255,240,210,0.3)';
      if (z.w < z.h) ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, 2, z.h);
      else ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, 2);
    } else if (z.kind === 'board') {
      // まな板
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      this._roundRect(ctx, z.x - z.w / 2 + 3, z.y - z.h / 2 + 4, z.w, z.h, 8);
      ctx.fill();
      ctx.fillStyle = '#f3e3c3';
      this._roundRect(ctx, z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,120,70,0.35)';
      ctx.lineWidth = 1.5;
      for (let i = 1; i < 5; i++) {
        const yy = z.y - z.h / 2 + (i * z.h) / 5;
        ctx.beginPath();
        ctx.moveTo(z.x - z.w / 2 + 8, yy);
        ctx.lineTo(z.x + z.w / 2 - 8, yy + 2);
        ctx.stroke();
      }
    } else if (z.kind === 'rim') {
      // 給食の トレー：ふちが 段差
      const t = z.rim ?? 10;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      this._roundRect(ctx, z.x - z.w / 2 + 3, z.y - z.h / 2 + 5, z.w, z.h, 14);
      ctx.fill();
      ctx.fillStyle = '#7fb6a6';
      this._roundRect(ctx, z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 14);
      ctx.fill();
      ctx.fillStyle = '#a9d6c8';
      this._roundRect(ctx, z.x - z.w / 2 + t, z.y - z.h / 2 + t, z.w - t * 2, z.h - t * 2, 9);
      ctx.fill();
      // お皿のくぼみ
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(z.x - z.w * 0.22, z.y, z.w * 0.16, z.h * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(z.x + z.w * 0.22, z.y, z.w * 0.16, z.h * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 絵の具・牛乳：水たまり（ふちが でこぼこ）
      const col = z.kind === 'milk' ? 'rgba(255,255,255,0.88)' : z.color || '#3b82f6';
      ctx.fillStyle = col;
      ctx.globalAlpha = z.kind === 'milk' ? 1 : 0.75;
      ctx.beginPath();
      const n = 36;
      const sd = z.x * 0.13 + z.y * 0.07;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = z.r * (0.88 + 0.08 * Math.sin(a * 3 + sd) + 0.05 * Math.sin(a * 5 + sd * 2));
        const px = z.x + Math.cos(a) * rr;
        const py = z.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = z.kind === 'milk' ? 'rgba(160,190,220,0.7)' : 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(z.x - z.r * 0.3, z.y - z.r * 0.3, z.r * 0.22, z.r * 0.1, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // バンブー：竹 2本（次の 番で 閉じるときは 点めつ）
  _drawBamboo(ctx, b, now) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    if (b.closing) {
      const k = 0.5 + 0.5 * Math.sin(now / 150);
      ctx.fillStyle = `rgba(255,214,0,${0.15 + 0.2 * k})`;
      ctx.fillRect(-b.len / 2, -b.gap / 2, b.len, b.gap);
    }
    for (const y of [-b.gap / 2, b.gap / 2]) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(-b.len / 2 + 2, y - 4, b.len, 10);
      ctx.fillStyle = '#8bc34a';
      ctx.beginPath();
      roundRectPath(ctx, -b.len / 2, y - 5, b.len, 10, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(51,105,30,0.7)';
      for (let i = 1; i < 5; i++) ctx.fillRect(-b.len / 2 + (b.len * i) / 5, y - 5, 2, 10);
    }
    if (b.closing) {
      ctx.fillStyle = 'rgba(80,60,0,0.9)';
      ctx.font = '800 13px "M PLUS Rounded 1c", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('次の番で 閉じる！', 0, -b.gap / 2 - 10);
    }
    ctx.restore();
  }

  // ハゴイタンの 墨で ×（次の番 ねらいの線が 見えない）
  _drawInk(ctx, e) {
    const r = eraserExtent(e.def) * e.size * 0.75;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,20,20,0.85)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-r, -r);
    ctx.lineTo(r, r);
    ctx.moveTo(r, -r);
    ctx.lineTo(-r, r);
    ctx.stroke();
    ctx.restore();
  }

  // ナットウで くっついた 2つの あいだの ネバネバの 糸
  _drawNattoThreads(ctx, s, now) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * 5;
      const mx = (s.ax + s.bx) / 2 + Math.sin(now / 200 + i) * 6;
      const my = (s.ay + s.by) / 2 + off + Math.cos(now / 240 + i) * 6;
      ctx.beginPath();
      ctx.moveTo(s.ax, s.ay + off);
      ctx.quadraticCurveTo(mx, my, s.bx, s.by + off);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPetanqueRing(ctx, r, now) {
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -now / 40;
    ctx.strokeStyle = 'rgba(255,193,7,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,193,7,0.12)';
    ctx.fill();
    ctx.rotate(-(this.view.rot || 0)); // 画面が 回っていても 文字は まっすぐ
    ctx.fillStyle = 'rgba(160,110,0,0.9)';
    ctx.font = '800 14px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 ここから 弾くと パワーアップ', 0, -r - 8);
    ctx.restore();
  }

  // マンカランの 小石（上に 来ると 止まる）
  _drawPebble(ctx, z) {
    ctx.save();
    const cols = ['#90caf9', '#f48fb1', '#fff59d'];
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + z.x * 0.05;
      const x = z.x + Math.cos(a) * z.r * 0.4;
      const y = z.y + Math.sin(a) * z.r * 0.4;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(x + 1.5, y + 2, z.r * 0.42, z.r * 0.32, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.ellipse(x, y, z.r * 0.42, z.r * 0.32, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // アゲパンの 砂糖の道（すべりにくい）
  _drawSugar(ctx, z) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,248,225,0.35)';
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996;
      const r = z.r * Math.sqrt(((i * 37) % 100) / 100);
      ctx.fillStyle = i % 4 ? 'rgba(255,255,255,0.95)' : 'rgba(240,200,120,0.9)';
      ctx.fillRect(z.x + Math.cos(a) * r - 1, z.y + Math.sin(a) * r - 1, 2.2, 2.2);
    }
    ctx.restore();
  }

  _drawWax(ctx, z, now) {
    if (z.stage || z.kind === 'milk') return this._drawStageZone(ctx, z);
    if (z.kind === 'sugar') return this._drawSugar(ctx, z);
    if (z.kind === 'pebble') return this._drawPebble(ctx, z);
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
    // 完全に まっくら。見えるのは 弾く人の 消しゴムの まわりだけ（ふちは ぼんやり）
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.rect(0, 0, this.w, this.h);
    const cur = state.erasers[state.turnIndex];
    let spot = null;
    if (cur && cur.alive) {
      const p = this.worldToScreen(cur.x, cur.y);
      const r = (eraserExtent(cur.def) * cur.size + 26) * this.zoomScale;
      spot = { p, r };
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2, true);
    }
    ctx.fill('evenodd');
    if (spot) {
      const g = ctx.createRadialGradient(spot.p.x, spot.p.y, spot.r * 0.55, spot.p.x, spot.p.y, spot.r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(spot.p.x, spot.p.y, spot.r + 1, 0, Math.PI * 2);
      ctx.fill();
    }
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
  // ドミノン：立てた ドミノ（上から 見ると 細い 牌）
  _drawDominoTile(ctx, x, y, angle, L, W, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-L / 2 + 2, -W / 2 + 4, L, W);
    ctx.fillStyle = '#fafafa';
    ctx.beginPath();
    roundRectPath(ctx, -L / 2, -W / 2, L, W, 2);
    ctx.fill();
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#212121';
    ctx.fillRect(-1, -W / 2 + 1, 2, W - 2);
    for (const px of [-L * 0.3, -L * 0.15, L * 0.22]) {
      ctx.beginPath();
      ctx.arc(px, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

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
    if (look === 'domino') return this._drawDominoTile(ctx, x, y, angle, L, W, scale);
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
    // ハゴイタンの 墨で ×：ねらいの線が 見えない（強さの ゲージだけ）
    if (e.effects?.inked) {
      ctx.save();
      ctx.fillStyle = 'rgba(20,20,20,0.8)';
      ctx.font = '800 16px "M PLUS Rounded 1c", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('墨で 見えない！', e.x, e.y - eraserExtent(e.def) * e.size - 14);
      ctx.restore();
      return;
    }

    if (e.def.trait?.id === 'boccia') aim = { ...aim, strength: e.def.trait.fixed ?? 0.72, spin: 0 }; // ボッチャ：いつも 同じ 強さ
    const start = eraserExtent(e.def) * e.size + 10;
    const L = 30 + aim.strength * 220;
    const spin = aim.spin || 0;
    const p0 = { x: start, y: 0 };
    const p1 = { x: start + L * 0.6, y: 0 };
    // 曲がり：回転（＝指を 置いた 場所）で 曲がる。見やすいように 表示だけ 少し 大きめ（物理は かえない）
    const p2 = { x: start + L, y: spin * L * 0.5 };
    const ta = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const head = 24;
    const end = { x: p2.x - Math.cos(ta) * head * 0.7, y: p2.y - Math.sin(ta) * head * 0.7 };
    const color = this._strengthColor(aim.strength);
    const max = aim.strength >= 0.999; // いちばん 強い
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);

    ctx.save();
    ctx.translate(e.x, e.y);
    const wobble = state.glare ? Math.sin(performance.now() / 70) * state.glare * 0.9 : 0; // キラリンで まぶしい
    ctx.rotate(Math.atan2(aim.dirY, aim.dirX) + wobble);
    ctx.globalAlpha = 0.92;
    ctx.lineCap = 'round';
    // 強さの 色：根もとは みどり → 先は いまの 強さの 色（弱い みどり → 黄 → 赤）。MAX は 金の ふちで 光る
    const grad = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
    for (let k = 0; k <= 4; k++) grad.addColorStop(k / 4, this._strengthColor((aim.strength * k) / 4)); // 色を まぜると にごるので、とちゅうの 色も 入れる
    const rim = max ? '#ffd54f' : 'white';
    if (max) {
      ctx.shadowColor = 'rgba(255, 90, 0, 0.95)';
      ctx.shadowBlur = 12 + 12 * pulse;
    }
    for (const [lw, col] of [[max ? 22 + 3 * pulse : 18, rim], [11, grad]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(p1.x, p1.y, end.x, end.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // ハジキング：当たる 相手と、その相手が 飛ぶ 向きまで 見える
    if (e.def.trait?.id === 'hajiki') this._drawHajikiGuide(ctx, state, e, aim);
    // ナイトン（L字）・ブーメ（弧）：進む 道を 点線で
    if (e.def.trait?.id === 'knight' || e.def.trait?.id === 'boomerang') this._drawCurvedGuide(ctx, e, aim);
    // チクワ：のぞき穴で、ねらいの線が 長く見える（点線）
    if (e.def.trait?.id === 'scope') {
      const G = e.def.trait.guide ?? 260;
      ctx.save();
      ctx.setLineDash([10, 10]);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x + Math.cos(ta) * G, p2.y + Math.sin(ta) * G);
      ctx.stroke();
      ctx.restore();
    }
    ctx.translate(p2.x, p2.y);
    ctx.rotate(ta);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-head, -16);
    ctx.lineTo(-head, 16);
    ctx.closePath();
    if (max) {
      ctx.shadowColor = 'rgba(255, 90, 0, 0.95)';
      ctx.shadowBlur = 12 + 12 * pulse;
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = max ? 4 : 3;
    ctx.strokeStyle = rim;
    ctx.stroke();
    ctx.restore();
  }

  /** ナイトン・ブーメ：曲がる 道（いまの 回転した 座標で かく。つかむ 場所で 向きが かわる） */
  _drawCurvedGuide(ctx, e, aim) {
    const t = e.def.trait;
    const side = (aim.spin || 0) < 0 ? -1 : 1;
    const me = eraserExtent(e.def) * e.size;
    ctx.save();
    ctx.setLineDash([7, 7]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    let end;
    let dir;
    if (t.id === 'knight') {
      const leg = t.leg ?? 110;
      const b = 60 + 140 * aim.strength;
      ctx.moveTo(me + 4, 0);
      ctx.lineTo(leg, 0);
      ctx.lineTo(leg, side * b);
      end = { x: leg, y: side * b };
      dir = { x: 0, y: side };
    } else {
      const R = 30 + 110 * aim.strength;
      const a0 = -side * Math.PI / 2;
      const span = 5.2;
      ctx.arc(0, side * R, R, a0, a0 + side * span, side < 0);
      const ae = a0 + side * span;
      end = { x: Math.cos(ae) * R, y: side * R + Math.sin(ae) * R };
      dir = { x: -Math.sin(ae) * side, y: Math.cos(ae) * side };
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const ha = Math.atan2(dir.y, dir.x);
    ctx.beginPath();
    ctx.moveTo(end.x + Math.cos(ha) * 10, end.y + Math.sin(ha) * 10);
    ctx.lineTo(end.x + Math.cos(ha + 2.5) * 10, end.y + Math.sin(ha + 2.5) * 10);
    ctx.lineTo(end.x + Math.cos(ha - 2.5) * 10, end.y + Math.sin(ha - 2.5) * 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** ハジキング：まっすぐ 進んで 最初に 当たる 相手と、その相手が 飛ぶ向き（いまの 回転した 座標で かく） */
  _drawHajikiGuide(ctx, state, e, aim) {
    const ang = Math.atan2(aim.dirY, aim.dirX);
    const c = Math.cos(-ang);
    const s = Math.sin(-ang);
    const me = eraserExtent(e.def) * e.size;
    let best = null;
    for (const o of [...state.erasers, ...state.extras]) {
      if (!o.alive || o === e || o.playerIndex === e.playerIndex) continue;
      if (o.trait?.clear && o.trait.clearAlpha === 0) continue; // 見えない 相手は わからない
      if (o.effects?.invisible) continue;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      const R = me + eraserExtent(o.def) * o.size;
      if (lx <= 0 || Math.abs(ly) >= R) continue;
      const hit = lx - Math.sqrt(R * R - ly * ly);
      if (hit < 0) continue;
      if (!best || hit < best.hit) best = { hit, lx, ly };
    }
    const L = best ? best.hit : 330;
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,150,170,0.9)';
    ctx.beginPath();
    ctx.moveTo(me + 6, 0);
    ctx.lineTo(L, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    if (best) {
      // 当たる ときの 自分の 場所（うすい 丸）
      ctx.beginPath();
      ctx.arc(best.hit, 0, me, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,150,170,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 相手が 飛ぶ 向き
      const vx = best.lx - best.hit;
      const vy = best.ly;
      const vl = Math.hypot(vx, vy) || 1;
      const ex = best.lx + (vx / vl) * 110;
      const ey = best.ly + (vy / vl) * 110;
      ctx.strokeStyle = 'rgba(255,87,34,0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(best.lx, best.ly);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      const ha = Math.atan2(vy, vx);
      ctx.fillStyle = 'rgba(255,87,34,0.95)';
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(ha) * 10, ey + Math.sin(ha) * 10);
      ctx.lineTo(ex + Math.cos(ha + 2.5) * 10, ey + Math.sin(ha + 2.5) * 10);
      ctx.lineTo(ex + Math.cos(ha - 2.5) * 10, ey + Math.sin(ha - 2.5) * 10);
      ctx.closePath();
      ctx.fill();
    }
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
