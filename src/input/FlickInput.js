// 指・マウスの操作（Pointer Events でタッチとマウスの両方に対応）
//
// 1. 弾く（パチンコ式）… 自分の消しゴムを触って、引っぱって離す。
//    触ったところから指を引いた向きの「反対」に飛ぶ。引いた距離が強さ。
//    消しゴムの中心からずれたところを触ると回転がかかる。
// 2. 曲げる（カーブのカード）… 動いている間、画面をなぞった向きに曲がる。
// 3. 置く（バリア・ワックスがけ・瞬間移動）… placement をセットすると、置く場所を選ぶ操作になる。

import { GAME } from '../config/game.js';
import { PHYSICS } from '../config/physics.js';

export class FlickInput {
  constructor(canvas, renderer, game) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.game = game;
    this.drag = null;
    this.aim = null; // 描画用：{ playerIndex, dirX, dirY, strength, spin }
    this.placement = null; // { kind, def, playerIndex, onPlace(params) }
    this.preview = null; // 描画用：置く場所のプレビュー
    this.steerDrag = null;

    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this._cancel = this._cancel.bind(this);
    canvas.addEventListener('pointerdown', this._down);
    canvas.addEventListener('pointermove', this._move);
    canvas.addEventListener('pointerup', this._up);
    canvas.addEventListener('pointercancel', this._cancel);
  }

  detach() {
    this.canvas.removeEventListener('pointerdown', this._down);
    this.canvas.removeEventListener('pointermove', this._move);
    this.canvas.removeEventListener('pointerup', this._up);
    this.canvas.removeEventListener('pointercancel', this._cancel);
  }

  /** カードで置く場所を選ぶモードにする（null でやめる） */
  setPlacement(pl) {
    this.placement = pl;
    this.preview = null;
    this.drag = null;
    this.aim = null;
  }

  /** カードで相手を1人えらぶモードにする（null でやめる）{ candidates: [番号], onPick(番号) } */
  setTargeting(t) {
    this.targeting = t;
    this.drag = null;
    this.aim = null;
  }

  _local(ev) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  _capture(ev) {
    try {
      this.canvas.setPointerCapture(ev.pointerId); // 指が外に出ても追いかける
    } catch {
      /* 取れなくても操作はできる */
    }
  }

  _isHumanTurn() {
    const g = this.game;
    return g.players[g.turnIndex].type === 'human';
  }

  _down(ev) {
    const g = this.game;
    if (this.drag || this.steerDrag) return;
    const p = this._local(ev);
    const w = this.renderer.screenToWorld(p.x, p.y);

    // 相手をえらぶ
    if (this.targeting) {
      const slop = GAME.input.touchSlopPx / this.renderer.zoomScale;
      const idx = g.hitTest(w.x, w.y, slop);
      if (this.targeting.candidates.includes(idx)) this.targeting.onPick(idx);
      ev.preventDefault();
      return;
    }

    // 置く
    if (this.placement) {
      this._capture(ev);
      this.drag = { id: ev.pointerId, mode: 'place', sx: p.x, sy: p.y, wx: w.x, wy: w.y, angle: 0 };
      this._updatePreview(w.x, w.y, 0);
      ev.preventDefault();
      return;
    }

    // 曲げる（カーブ）
    if (g.canSteer(g.turnIndex) && this._isHumanTurn()) {
      this._capture(ev);
      this.steerDrag = { id: ev.pointerId, lx: p.x, ly: p.y };
      ev.preventDefault();
      return;
    }

    // 弾く
    if (g.phase !== 'aim' || !this._isHumanTurn()) return;
    const slop = GAME.input.touchSlopPx / this.renderer.zoomScale;
    const piece = g.hitTestPiece(w.x, w.y, slop);
    const mine = piece && piece.playerIndex === g.turnIndex;
    // パカッターが分かれているときは、さわったほうを弾く
    if (mine) g.selectPiece(g.turnIndex, piece);

    this._capture(ev);
    const st = g.getState().erasers[g.turnIndex];
    this.drag = {
      id: ev.pointerId,
      mode: 'flick',
      sx: p.x,
      sy: p.y,
      playerIndex: g.turnIndex,
      // 画面の どこからでも 引っぱれる（画面の 端に いても 大きく 引けるように）。
      // 回転は 指を 置いた 場所で きまる：消しゴムを 通る ねらいの 線の 右から 引くか 左から 引くか
      anywhere: !mine,
      gx: w.x - st.x,
      gy: w.y - st.y,
      ext: g.extentOf(g.turnIndex),
    };
    this.aim = { playerIndex: g.turnIndex, dirX: 0, dirY: 0, strength: 0, spin: 0 };
    ev.preventDefault();
  }

  _move(ev) {
    const p = this._local(ev);

    if (this.steerDrag && ev.pointerId === this.steerDrag.id) {
      const dx = p.x - this.steerDrag.lx;
      const dy = p.y - this.steerDrag.ly;
      if (Math.hypot(dx, dy) > 4) {
        const d = this.renderer.screenDeltaToWorld(dx, dy);
        this.game.steer(this.game.turnIndex, d.x, d.y);
        this.steerDrag.lx = p.x;
        this.steerDrag.ly = p.y;
      }
      return;
    }

    if (!this.drag || ev.pointerId !== this.drag.id) return;

    if (this.drag.mode === 'place') {
      const w = this.renderer.screenToWorld(p.x, p.y);
      if (this.placement.kind === 'pencil') {
        // えんぴつ：最初に触ったところが真ん中。ドラッグした向きにまわる
        const dx = p.x - this.drag.sx;
        const dy = p.y - this.drag.sy;
        if (Math.hypot(dx, dy) > 10) {
          const d = this.renderer.screenDeltaToWorld(dx, dy);
          this.drag.angle = Math.atan2(d.y, d.x);
        }
        this._updatePreview(this.drag.wx, this.drag.wy, this.drag.angle);
      } else {
        this._updatePreview(w.x, w.y, 0);
      }
      return;
    }

    const dx = this.drag.sx - p.x;
    const dy = this.drag.sy - p.y;
    const pull = Math.hypot(dx, dy);
    const { maxPullPx, minPullPx } = GAME.input;
    const d = this.renderer.screenDeltaToWorld(dx, dy);
    // （フルーツンでこんらん中でも 矢印はふつう。たまに反対に飛ぶのは Game が決める）
    // さかさま（カード）のときは、ほんとうに飛ぶ向き（反対）に 矢印を出す
    // ショウジョウヅツは 転がる向きにしか 進めないので、その向きを出す
    const [ax, ay] = this.game.aimDir(this.drag.playerIndex, d.x, d.y);
    this.aim = {
      playerIndex: this.drag.playerIndex,
      dirX: ax, // 矢印の向き（ほんとうに飛ぶ向き）
      dirY: ay,
      rawX: d.x, // Game.flick にわたす向き
      rawY: d.y,
      strength: pull < minPullPx ? 0 : Math.min(1, pull / maxPullPx),
      // 回転：指を 置いた 場所が、ねらいの 線の 右か 左か
      spin: this._spin(ax, ay),
    };
  }

  // 中心からずれたところを弾くと回転する（-1〜1）
  _spin(dirX, dirY) {
    const l = Math.hypot(dirX, dirY);
    if (l < 1e-6) return 0;
    const ux = dirX / l;
    const uy = dirY / l;
    // 消しゴムを つかんだ ときは 消しゴムの 大きさで、どこかから 引いた ときは anySpinFull で わる
    const scale = this.drag.anywhere ? GAME.input.anySpinFull ?? 170 : this.drag.ext;
    const cross = (this.drag.gx * uy - this.drag.gy * ux) / scale;
    const c = Math.max(-1, Math.min(1, cross));
    const dz = PHYSICS.spin.deadZone;
    if (Math.abs(c) < dz) return 0;
    return (Math.sign(c) * (Math.abs(c) - dz)) / (1 - dz);
  }

  _updatePreview(x, y, angle) {
    const pl = this.placement;
    const g = this.game;
    // せきがえ：いま ならべている 消しゴムを、そこに置けるか
    if (pl.kind === 'seat') {
      const piece = g.pieceByPid(pl.pid);
      const v = g.validateSeat(pl.pid, x, y, pl.chosen, pl.def.params?.edgeMargin ?? 60);
      this.preview = {
        kind: 'eraser', x, y, angle: piece.body.angle, ok: v.ok, reason: v.reason,
        def: piece.def, size: piece.size, params: {},
        chosen: pl.chosen.map((c) => {
          const o = g.pieceByPid(c.pid);
          return { x: c.x, y: c.y, angle: o.body.angle, def: o.def, size: o.size };
        }),
      };
      return;
    }
    const v = g.validatePlacement(pl.kind, { x, y, angle }, pl.playerIndex, pl.def);
    this.preview = {
      kind: pl.kind,
      x,
      y,
      angle: pl.kind === 'eraser' ? g.getState().erasers[pl.playerIndex].angle : angle,
      ok: v.ok,
      reason: v.reason,
      def: g.erasers[pl.playerIndex].def,
      size: g.erasers[pl.playerIndex].size,
      params: pl.def.params || {},
    };
  }

  _up(ev) {
    if (this.steerDrag && ev.pointerId === this.steerDrag.id) {
      this.steerDrag = null;
      this.game.steer(this.game.turnIndex, 0, 0);
      return;
    }
    if (!this.drag || ev.pointerId !== this.drag.id) return;

    if (this.drag.mode === 'place') {
      this._move(ev);
      const pv = this.preview;
      this.drag = null;
      if (pv && pv.ok) this.placement.onPlace({ x: pv.x, y: pv.y, angle: pv.angle });
      else if (pv) this.placement.onInvalid?.(pv.reason);
      return;
    }

    this._move(ev);
    const aim = this.aim;
    this.drag = null;
    this.aim = null;
    if (aim && aim.strength > 0) {
      this.game.flick(aim.playerIndex, aim.rawX, aim.rawY, aim.strength, aim.spin);
    }
  }

  _cancel() {
    if (this.steerDrag) this.game.steer(this.game.turnIndex, 0, 0);
    this.steerDrag = null;
    this.drag = null;
    this.aim = null;
  }
}
