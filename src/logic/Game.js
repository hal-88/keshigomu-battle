// ゲームのロジック（物理・ターン・カード・とくせい・勝敗）。描画のことは一切知らない。
// 描画側は getState() で今の様子を受け取って絵にするだけ。
//
// phase（いまの状態）
//   aim       … 弾く前（カードもこのときだけ使える）
//   moving    … 弾いて動いている
//   settling  … じしんなどで動いている（止まったら同じ人がそのまま弾く）
//   shrinking … サドンデスで机がけずれて、落ちる消しゴムを待っている
//   over      … 決着
//
// 消しゴムのかたまり（piece）
//   this.erasers[i] … i 番目の人の「メイン」の消しゴム
//   this.extras     … パカッターが分かれたときの「かけら」（メインが落ちたら、かけらがメインになる）
//   this.debris     … 落ちていくところ（演出用）
//   this.junk       … 外れたパーツ・カバー（だれのものでもない。机の上にころがっていて、ぶつかれる）

import Matter from 'matter-js';
import { PHYSICS } from '../config/physics.js';
import { GAME } from '../config/game.js';
import { drawRandomCard, findCard } from '../config/cards.js';
import { findEraser, REGULAR_ERASERS } from '../config/erasers.js';
import {
  deskSize, isInsideDesk, distanceToEdge, eraserExtent, edgeClearance,
  clampInside, shrinkShape, pointSegDist,
} from './geometry.js';

const { Engine, Bodies, Body, Composite, Events } = Matter;
const BASE_DT = 1000 / 60;

// 相手のカードのうち、クロケシ（ガード）にきかないもの
const GUARDED_CARDS = ['skip', 'swap', 'fan', 'quake', 'guruguru', 'reverse', 'shrinkbeam', 'tilt', 'shuffle'];

const traitOf = (e) => e.def?.trait || {};
// フルーツンの「こんらん」の数値（反対に飛ぶ確率・強さ）
const confuseParams = () => findEraser('fruit')?.trait || {};

export class Game {
  /**
   * @param {object} opts
   * @param {object} opts.desk    desks.js の1項目
   * @param {Array}  opts.players [{ name, type: 'human'|'cpu', eraser, color, card }]
   */
  constructor({ desk, players, firstTurn = 0 }) {
    this.desk = { ...desk, shape: { ...desk.shape } }; // サドンデスで形が変わるのでコピー
    this.players = players.map((p, i) => ({
      ...p,
      index: i,
      card: p.card ? { def: p.card, used: false } : null,
      skipNext: false,
    }));
    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      positionIterations: 10,
      velocityIterations: 8,
    });
    this._nextPid = 1; // 消しゴム1つずつの番号（オンラインで同じものを指すため）
    this.erasers = this.players.map((p, i) => {
      const pos = this._startPosition(i, this.players.length);
      return this._makePiece(p.eraser, i, pos.x, pos.y, pos.a + Math.PI / 2); // 広い面を机の中央に向ける
    });
    this.extras = [];
    this.debris = [];
    this.junk = [];
    this._junkQueue = [];
    this._hatchQueue = []; // タマゴン：からが われるのを待っている
    this._nextJid = 1;
    this.pencils = [];
    this.waxZones = [];
    this.tilt = null; // かたむき { x, y, untilTurn }
    this.blackout = null; // ていでん { fromTurn, untilTurn }
    this.blackHole = null; // ブラックホール { x, y, r, R, pull, untilTurn }

    this.turnIndex = Math.max(0, Math.min(this.players.length - 1, firstTurn)); // いま弾く人（さいしょはルーレットで決めた人）
    this.turnCount = 1; // 全体で何ターン目か
    this.turn = this._newTurn();
    this.phase = 'aim';
    this.result = null;
    this.pendingShrink = null; // 点滅で予告中の「けずれたあとの形」
    this.fallOrder = []; // 落ちた順（順位を出すため）
    this.time = 0;

    this._listeners = {};
    this._stillFrames = 0;
    this._movingMs = 0;
    Events.on(this.engine, 'collisionStart', (ev) => this._onCollision(ev));
  }

  // ---- イベント ----
  on(name, fn) {
    (this._listeners[name] ||= []).push(fn);
  }
  _emit(name, data) {
    (this._listeners[name] || []).forEach((fn) => fn(data));
  }

  // ---- 準備 ----
  _newTurn() {
    return { flicked: false, extraFlicks: 0, curve: null, steer: null, homing: null, powerMul: 1, flickAt: -1 };
  }

  /** はじめの席。1人目は画面の下（手前）で、そこから時計回り（2人なら 手前と むこう） */
  _startPosition(i, n) {
    const { w, h } = deskSize(this.desk);
    const two = n === 2; // ななめの席・たての広がりは 2人のときだけ（3〜4人だと つまってしまう）
    const a = Math.PI / 2 + (i / n) * Math.PI * 2 + (two ? this.desk.seatTilt ?? 0 : 0);
    const k = this.desk.startSpread ?? 0.3;
    const ky = two ? this.desk.startSpreadY ?? k : k;
    return { x: Math.cos(a) * w * k, y: Math.sin(a) * h * ky, a };
  }

  /** i 番目の人の席が、机の上がわ（向こうがわ）か */
  isFarSeat(i) {
    return this._startPosition(i, this.players.length).y < -1;
  }

  /** 消しゴム1つ（かたまり）をつくって机に置く */
  _makePiece(def, playerIndex, x, y, angle, massScale = 1) {
    const s = def.shape;
    const frictionAir = PHYSICS.speedToFrictionAir[def.stats.speed] * this.desk.frictionScale;
    const opts = {
      frictionAir,
      restitution: PHYSICS.restitution,
      friction: PHYSICS.friction,
      frictionStatic: 0.1,
    };
    let body;
    if (s.type === 'rect') {
      body = Bodies.rectangle(x, y, s.w, s.h, { ...opts, chamfer: s.chamfer ? { radius: s.chamfer } : undefined });
    } else if (s.type === 'polygon') {
      body = Bodies.polygon(x, y, s.sides, s.radius, opts);
    } else {
      body = Bodies.circle(x, y, s.radius, opts);
    }
    Body.setAngle(body, angle);
    body.label = 'eraser';
    Composite.add(this.engine.world, body);

    const t = def.trait || {};
    const e = {
      pid: this._nextPid++,
      playerIndex,
      def,
      body,
      alive: true,
      fall: null,
      isExtra: false,
      maxSpeed: PHYSICS.powerToMaxSpeed[def.stats.power] * PHYSICS.flickSpeedScale,
      baseFrictionAir: frictionAir,
      baseMass: PHYSICS.balanceToMass[def.stats.balance] * massScale, // 重さはバランスだけで決める
      size: 1,
      // 重さ・すべりの倍率（とくせい・カード）
      traitMass: 1,
      cardMass: 1,
      frictionMul: 1,
      // カードの効果
      sizeLeft: 0, // ビッグ・ちびっこ が続く残りターン
      anchorPending: false,
      anchored: false,
      hold: false,
      holdUntil: 0,
      gripPending: false,
      grip: 0, // すべりどめ中のブレーキの倍率（0 はなし）
      // とくせいの状態
      covered: t.id === 'cover',
      parts: t.id === 'parts' ? t.count ?? 3 : 0,
      gathered: 0,
      confused: false,
      clear: false,
      splitDone: false,
      absorbNext: 0,
      pushNext: null,
      squishAt: -1e9,
      lastBreakAt: -1e9,
      // ガチャの とくべつ消しゴム
      dice: 0, // サイコロン：いまの目（1〜6）
      dicePower: 1,
      defUsed: false, // ニンジャ・ユウレイ・カガミン：1回だけの守りを使ったか
      ghost: false, // ユウレイケシ：すりぬけ中
      ghostEnd: false, // ユウレイケシ：番が終わったので、重なっていなければ もどす
      blockUsed: false, // ブロッケン
      boostUntil: 0, // ロケッター
      charged: true, // ダイオウケシ：ためてある（弾ける）
      cornerUsed: false, // マッサラ
      hatched: false, // タマゴン
      lastIce: null, // アイスケシ：さいごに こおらせた場所
      tailAt: 0, // キョウリュウ：しっぽで押す時間と相手
      tailTarget: null,
      // 2026-11-08 のカード
      powerNext: 0, // ためうち：つぎの自分のターンの強さの倍率
      invisLeft: 0, // とうめい：のこりの自分のターン
      shield: false, // ふでばこ
      extraLife: false, // もういっかい
      reverseNext: false, // さかさま
      airborne: false, // ジャンプ中
      airUntil: 0,
      pierceUntil: 0, // つらぬき
      pierceSpeed: 0,
      pierceDir: null,
      curTurnPos: { x, y }, // まきもどし：いまのターンと、1つ前の自分のターンの はじめの場所
      prevTurnPos: null,
      // トーナメント優勝 限定
      toppleUntil: 0, // トロフィン：倒れて転がっている
      stampUsed: false, // ハナマルン：はなまるを押したか
      happy: false, // はなまるを押されて、次の番 動けない
      pierceMs: 0,
      pierceKeep: 0,
    };
    if (e.covered) e.traitMass = t.massScale ?? 1.45;
    if (t.weight) e.traitMass = t.weight; // カラッポ（かるい）・ダイオウケシ（おもい）
    if (t.id === 'glow' && this.desk.dark) {
      // ヒカルン：くらい机では ぜんぶアップ
      e.traitMass = t.mass ?? 1.2;
      e.maxSpeed *= t.power ?? 1.12;
      e.frictionMul = t.slide ?? 0.9;
    }
    if (t.id === 'corner') {
      // マッサラ：ぜんぶの力が すこし高い
      const k = t.allUp ?? 1.06;
      e.traitMass = k;
      e.maxSpeed *= k;
      e.frictionMul = 1 / k;
    }
    body.plugin = { piece: e };
    if (t.id === 'dice') this._rollDice(e, true);
    this._applyMass(e);
    return e;
  }

  /** サイコロン：サイコロをふって、その目の能力にする */
  _rollDice(e, quiet = false) {
    e.dice = 1 + Math.floor(Math.random() * 6);
    this._applyDice(e);
    if (!quiet) {
      const f = traitOf(e).faces[e.dice - 1];
      this._emit('trait', { type: 'dice', playerIndex: e.playerIndex, x: e.body.position.x, y: e.body.position.y, value: e.dice, name: f.name });
    }
  }

  _applyDice(e) {
    const f = traitOf(e).faces?.[e.dice - 1];
    if (!f) return;
    e.traitMass = f.mass ?? 1;
    e.frictionMul = f.brake ?? 1;
    e.dicePower = f.power ?? 1;
    this._applyMass(e);
  }

  /** 重さ = バランスの重さ × とくせい × カード（動かない間は、あとで反映） */
  _applyMass(e) {
    if (e.body.isStatic) return;
    Body.setMass(e.body, e.baseMass * e.traitMass * e.cardMass);
  }

  _allPieces() {
    return [...this.erasers, ...this.extras];
  }

  extentOf(i) {
    return this.pieceExtent(this.erasers[i]);
  }

  pieceExtent(e) {
    return eraserExtent(e.def) * e.size;
  }

  // ---- 弾く ----
  /** いまのターンの人が弾く。dir は向き、strength は 0〜1、spin は -1〜1（回転） */
  flick(playerIndex, dirX, dirY, strength, spin = 0) {
    if (this.phase !== 'aim' || playerIndex !== this.turnIndex) return false;
    const e = this.erasers[playerIndex];
    if (!e.alive) return false;
    const t = traitOf(e);
    const len = Math.hypot(dirX, dirY) || 1;
    let ux = dirX / len;
    let uy = dirY / len;
    let s = Math.max(0, Math.min(1, strength));
    // フルーツン：こんらん中は、5回に1回くらい 反対の向きに よわく飛んでしまう
    const confused = e.confused;
    let backfire = false;
    if (confused) {
      e.confused = false;
      const c = confuseParams();
      if (Math.random() < (c.backChance ?? 0.2)) {
        ux = -ux;
        uy = -uy;
        s *= c.backPower ?? 0.3;
        backfire = true;
      }
    }
    // さかさま：向きが 反対（矢印も 反対に出ている）
    if (e.reverseNext) {
      e.reverseNext = false;
      ux = -ux;
      uy = -uy;
    }
    // キラリン：まぶしくて、向きが すこし ブレる
    const glare = this.glareFor(playerIndex);
    if (glare) {
      const a = (Math.random() * 2 - 1) * glare;
      [ux, uy] = [ux * Math.cos(a) - uy * Math.sin(a), ux * Math.sin(a) + uy * Math.cos(a)];
    }
    // ショウジョウヅツ：転がる向き（筒の長さと 直角）にしか 進めない
    if (t.id === 'tube') {
      const r = this._tubeAim(e, ux, uy);
      [ux, uy] = [r.x, r.y];
      Body.setAngle(e.body, e.body.angle + r.turn); // 指で すこしだけ 向きを かえられる
    }
    const v = s * e.maxSpeed * this.turn.powerMul * (e.dicePower || 1);
    Body.setVelocity(e.body, { x: ux * v, y: uy * v });
    const spinScale = t.id === 'spinny' ? t.spinScale ?? 1.7 : 1;
    let w = Math.max(-1, Math.min(1, spin)) * PHYSICS.spin.maxAngular * s * spinScale;
    // ドーナッツ：まん中を弾いても くるくる回る
    if (t.autoSpin && Math.abs(w) < t.autoSpin * s) w = (w < 0 ? -1 : 1) * t.autoSpin * Math.max(0.4, s);
    if (t.id === 'tube') w = 0; // 転がるだけで 回らない
    // ロケッター：強く弾くと まっすぐ突進
    if (t.id === 'rocket' && s >= (t.minPower ?? 0.8) && !backfire) {
      e.boostUntil = this.time + (t.ms ?? 520);
      w = 0;
      this._emit('trait', { type: 'boost', playerIndex, x: e.body.position.x, y: e.body.position.y });
    }
    Body.setAngularVelocity(e.body, w);
    // ブロッケン：はじめて弾いたとき、うしろに ブロックを のこす
    if (t.id === 'block' && !e.blockUsed) this._placeBlock(e, ux, uy);
    // ダイオウケシ：弾いたら、つぎの自分の番は ためる番
    if (t.id === 'charge') e.charged = false;
    // ジャンプ：しばらく 空中（ほかのものを 飛びこえる）
    if (this.turn.jump) {
      e.airborne = true;
      e.airUntil = this.time + this.turn.jump;
      e.body.collisionFilter.mask = 0;
      this._emit('cardFx', { type: 'jump', playerIndex, x: e.body.position.x, y: e.body.position.y });
    }
    this.turn.flicked = true;
    this.turn.flickAt = this.time;
    this._startMotion('moving');
    this._emit('flick', { playerIndex, strength: s, confused, backfire });
    return true;
  }

  /** i 番目の人が弾くとき、まぶしさ（キラリン）でブレる角度。なければ 0 */
  glareFor(i) {
    let g = 0;
    for (const o of this._allPieces()) {
      const t = traitOf(o);
      if (o.alive && o.playerIndex !== i && t.id === 'glare') g = Math.max(g, t.spread ?? 0.09);
    }
    return g;
  }

  /** ブロッケン：弾いた向きの うしろに、ブロックの壁を1こ置く */
  _placeBlock(e, ux, uy) {
    const t = traitOf(e);
    const L = t.length ?? 58;
    const W = t.width ?? 24;
    const p = e.body.position;
    const d = this.pieceExtent(e) + W / 2 + 4;
    const q = { x: p.x - ux * d, y: p.y - uy * d };
    if (!isInsideDesk(this.desk, q.x, q.y) || edgeClearance(this.desk, q.x, q.y) < L / 2) return;
    const hit = this._allPieces().some(
      (o) => o.alive && o !== e && Math.hypot(o.body.position.x - q.x, o.body.position.y - q.y) < this.pieceExtent(o) + L / 2,
    );
    if (hit) return;
    e.blockUsed = true;
    this._addPencil(q.x, q.y, Math.atan2(uy, ux) + Math.PI / 2, { length: L, width: W, look: 'block', color: e.def.look.body });
    this._emit('trait', { type: 'block', playerIndex: e.playerIndex, x: q.x, y: q.y });
  }

  isConfused(i) {
    return !!this.erasers[i]?.confused;
  }

  /**
   * ショウジョウヅツを弾くとき：指で 少しだけ（maxTurn まで）向きを かえて、転がる向きに進む
   * @returns {{x, y, turn}} 進む向きと、筒を回す角度
   */
  _tubeAim(e, ux, uy) {
    const [nx, ny] = this._tubeDir(e, ux, uy);
    const maxTurn = ((traitOf(e).maxTurnDeg ?? 35) * Math.PI) / 180;
    const d = Math.atan2(nx * uy - ny * ux, nx * ux + ny * uy);
    const turn = Math.max(-maxTurn, Math.min(maxTurn, d));
    return { x: nx * Math.cos(turn) - ny * Math.sin(turn), y: nx * Math.sin(turn) + ny * Math.cos(turn), turn };
  }

  /** ショウジョウヅツが 進める向き（筒と直角の 2つのうち、ねらった向きに近いほう） */
  _tubeDir(e, ux, uy) {
    const a = e.body.angle;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const d = ux * nx + uy * ny;
    return d >= 0 ? [nx, ny] : [-nx, -ny];
  }

  /** ほんとうに飛ぶ向き（矢印に出す）：さかさま・ショウジョウヅツ */
  aimDir(i, dx, dy) {
    const e = this.erasers[i];
    if (!e) return [dx, dy];
    let x = dx;
    let y = dy;
    if (e.reverseNext) [x, y] = [-x, -y];
    if (traitOf(e).id === 'tube') {
      const l = Math.hypot(x, y) || 1;
      const r = this._tubeAim(e, x / l, y / l);
      [x, y] = [r.x * l, r.y * l];
    }
    return [x, y];
  }

  /** さかさま中か（弾く向きが反対） */
  isReversed(i) {
    return !!this.erasers[i]?.reverseNext;
  }

  /** カーブのカード：動いている間に曲げたい向き（0,0 で止める） */
  steer(playerIndex, dx, dy) {
    if (playerIndex !== this.turnIndex || !this.turn.curve) return;
    const l = Math.hypot(dx, dy);
    this.turn.steer = l > 1e-6 ? { x: dx / l, y: dy / l } : null;
  }

  canSteer(playerIndex) {
    return this.phase === 'moving' && playerIndex === this.turnIndex && !!this.turn.curve && this.turn.curve.budgetMs > 0;
  }

  /** (x, y) の近くにある消しゴムの持ち主番号。なければ -1 */
  hitTest(x, y, slop = 0) {
    return this.hitTestPiece(x, y, slop)?.playerIndex ?? -1;
  }

  /** (x, y) の近くにある消しゴム（かたまり）。なければ null */
  hitTestPiece(x, y, slop = 0) {
    let best = null;
    let bestD = Infinity;
    for (const e of this._allPieces()) {
      if (!e.alive) continue;
      const d = Math.hypot(e.body.position.x - x, e.body.position.y - y);
      if (d <= this.pieceExtent(e) + slop && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  /** 分かれた消しゴムのうち、弾くほうをえらぶ（えらんだほうがメインになる） */
  selectPiece(playerIndex, piece) {
    if (!piece || !piece.isExtra || piece.playerIndex !== playerIndex) return;
    const main = this.erasers[playerIndex];
    this.extras = this.extras.map((x) => (x === piece ? main : x));
    main.isExtra = true;
    piece.isExtra = false;
    this.erasers[playerIndex] = piece;
  }

  extrasOf(playerIndex) {
    return this.extras.filter((x) => x.alive && x.playerIndex === playerIndex);
  }

  // ---- カード ----
  canUseCard(i) {
    const p = this.players[i];
    return (
      this.phase === 'aim' && i === this.turnIndex && !!p.card && !p.card.used &&
      !this.turn.flicked && this.erasers[i].alive
    );
  }

  _guarded(e, cardOwner) {
    return traitOf(e).id === 'guard' && e.playerIndex !== cardOwner;
  }

  /** 相手を1人えらぶカードの、えらべる相手（クロケシのガードは えらべない） */
  opponentsOf(i, cardId = null) {
    return this.erasers
      .filter((e) => e.alive && e.playerIndex !== i)
      .filter((e) => !(cardId && GUARDED_CARDS.includes(cardId) && this._guarded(e, i)))
      .filter((e) => cardId !== 'thief' || (this.players[e.playerIndex].card && !this.players[e.playerIndex].card.used))
      .map((e) => e.playerIndex);
  }

  /** せきがえで ならべなおす じゅんばん（自分のものが先、つぎに相手） */
  seatOrder(i) {
    const all = this._allPieces().filter((e) => e.alive);
    return [...all.filter((e) => e.playerIndex === i), ...all.filter((e) => e.playerIndex !== i)].map((e) => e.pid);
  }

  pieceByPid(pid) {
    return this._allPieces().find((e) => e.pid === pid) || null;
  }

  /** せきがえ：pid の消しゴムを (x, y) に置けるか（chosen はもう決めた場所 [{pid, x, y}]） */
  validateSeat(pid, x, y, chosen = [], margin = 60) {
    const e = this.pieceByPid(pid);
    if (!e || !e.alive) return { ok: false, reason: 'その消しゴムは いないよ' };
    const ext = this.pieceExtent(e);
    if (!isInsideDesk(this.desk, x, y) || edgeClearance(this.desk, x, y) < margin) return { ok: false, reason: '縁に近すぎるよ' };
    for (const c of chosen) {
      if (c.pid === pid) continue;
      const o = this.pieceByPid(c.pid);
      if (o && Math.hypot(c.x - x, c.y - y) < ext + this.pieceExtent(o) + 4) return { ok: false, reason: '他の消しゴムと重なるよ' };
    }
    for (const pc of this.pencils) {
      if (!pc.alive) continue;
      const [a, b] = this._pencilEnds(pc);
      if (pointSegDist(x, y, a.x, a.y, b.x, b.y) < ext + pc.width / 2 + 2) return { ok: false, reason: '鉛筆と重なるよ' };
    }
    return { ok: true };
  }

  /** 場所を選ぶカードで、そこに置けるか */
  validatePlacement(kind, { x, y, angle = 0 }, playerIndex, def) {
    const p = def?.params || {};
    if (kind === 'circle') {
      return isInsideDesk(this.desk, x, y) ? { ok: true } : { ok: false, reason: '机の上を選んでね' };
    }
    if (kind === 'eraser') {
      const ext = this.extentOf(playerIndex);
      if (edgeClearance(this.desk, x, y) < (p.edgeMargin ?? 60)) return { ok: false, reason: '縁に近すぎるよ' };
      for (const o of this._allPieces()) {
        if (!o.alive || o === this.erasers[playerIndex]) continue;
        const d = Math.hypot(o.body.position.x - x, o.body.position.y - y);
        if (d < ext + this.pieceExtent(o) + 4) return { ok: false, reason: '他の消しゴムと重なるよ' };
      }
      for (const pc of this.pencils) {
        if (!pc.alive) continue;
        const [a, b] = this._pencilEnds(pc);
        if (pointSegDist(x, y, a.x, a.y, b.x, b.y) < ext + pc.width / 2 + 2) return { ok: false, reason: '鉛筆と重なるよ' };
      }
      return { ok: true };
    }
    if (kind === 'pencil') {
      const L = p.length ?? 150;
      const W = p.width ?? 14;
      const ax = x - (Math.cos(angle) * L) / 2;
      const ay = y - (Math.sin(angle) * L) / 2;
      const bx = x + (Math.cos(angle) * L) / 2;
      const by = y + (Math.sin(angle) * L) / 2;
      if (!isInsideDesk(this.desk, ax, ay) || !isInsideDesk(this.desk, bx, by)) return { ok: false, reason: '机からはみ出すよ' };
      for (const o of this._allPieces()) {
        if (!o.alive) continue;
        const d = pointSegDist(o.body.position.x, o.body.position.y, ax, ay, bx, by);
        if (d < this.pieceExtent(o) + W / 2 + 2) return { ok: false, reason: '消しゴムと重なるよ' };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  /**
   * カードを使う。params は場所（x, y, angle）や相手（target）
   * @returns {{ok: boolean, reason?: string}}
   */
  useCard(i, params = {}) {
    if (!this.canUseCard(i)) return { ok: false, reason: '今は使えないよ' };
    const p = this.players[i];
    const def = p.card.def;
    const e = this.erasers[i];
    const prm = def.params || {};
    let target = -1;

    if (def.place === 'seat') {
      const seats = params.seats || [];
      const need = this.seatOrder(i);
      if (seats.length !== need.length || !need.every((pid) => seats.some((c) => c.pid === pid))) {
        return { ok: false, reason: '全部の消しゴムの 場所を 決めてね' };
      }
      for (const c of seats) {
        const v = this.validateSeat(c.pid, c.x, c.y, seats, prm.edgeMargin ?? 60);
        if (!v.ok) return v;
      }
    } else if (def.place) {
      const v = this.validatePlacement(def.place, params, i, def);
      if (!v.ok) return v;
    }
    if (def.id === 'rewind') {
      const q = e.prevTurnPos;
      if (!q) return { ok: false, reason: 'まだ 戻る場所が ないよ' };
      const v = this.validatePlacement('eraser', q, i, { params: { edgeMargin: 1 } });
      if (!v.ok || !isInsideDesk(this.desk, q.x, q.y)) return { ok: false, reason: '戻る場所に 何かがあるよ' };
    }
    if (def.target) {
      const opps = this.opponentsOf(i, def.id);
      target = opps.includes(params.target) ? params.target : opps[0] ?? -1;
      if (target < 0) {
        const guarded = this.opponentsOf(i).length > 0;
        return { ok: false, reason: guarded ? '相手はガードしているよ' : '相手がいないよ' };
      }
    }

    // カードがきく相手（クロケシのガードはよける）
    const affected = (o) => o.alive && !o.body.isStatic && !(GUARDED_CARDS.includes(def.id) && this._guarded(o, i));

    switch (def.id) {
      case 'rapid':
        this.turn.extraFlicks += prm.extraFlicks ?? 1;
        break;
      case 'big':
      case 'mini':
        this._setSize(e, prm);
        e.sizeLeft = prm.turns ?? 2;
        break;
      case 'curve':
        this.turn.curve = { budgetMs: prm.maxMs ?? 1600, accel: prm.accel ?? 0.45 };
        break;
      case 'magnet':
        this.turn.homing = { budgetMs: prm.maxMs ?? 1300, accel: prm.accel ?? 0.3 };
        break;
      case 'fullpower':
        this.turn.powerMul = prm.powerScale ?? 1.5;
        break;
      case 'anchor':
        e.anchorPending = true;
        break;
      case 'barrier':
      case 'ruler':
        this._addPencil(params.x, params.y, params.angle || 0, prm);
        break;
      case 'hold':
        e.hold = true;
        break;
      case 'grip':
        e.gripPending = true;
        e.gripScale = prm.scale ?? 3;
        break;
      case 'fan': {
        // 自分から遠ざかる向きに、近い相手ほど強くふきとばす
        const range = prm.range ?? 380;
        for (const o of this._allPieces()) {
          if (o.playerIndex === i || !affected(o)) continue;
          const dx = o.body.position.x - e.body.position.x;
          const dy = o.body.position.y - e.body.position.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > range) continue;
          const v = Math.max(prm.minSpeed ?? 1.5, (prm.maxSpeed ?? 7.5) * (1 - d / range));
          Body.setVelocity(o.body, { x: (dx / d) * v, y: (dy / d) * v });
        }
        this._startMotion('settling');
        break;
      }
      case 'guruguru':
        for (const o of this._allPieces()) {
          if (!affected(o)) continue;
          const w = (prm.minSpin ?? 0.25) + Math.random() * ((prm.maxSpin ?? 0.5) - (prm.minSpin ?? 0.25));
          Body.setAngularVelocity(o.body, Math.random() < 0.5 ? -w : w);
        }
        this._startMotion('settling');
        break;
      case 'skip':
        this.players[target].skipNext = true;
        break;
      case 'wax':
        this.waxZones.push({ x: params.x, y: params.y, r: prm.radius ?? 90, scale: prm.frictionScale ?? 0.3, owner: i });
        break;
      case 'swap': {
        const o = this.erasers[target];
        const a = { ...e.body.position };
        const b = { ...o.body.position };
        Body.setPosition(e.body, b);
        Body.setPosition(o.body, a);
        break;
      }
      case 'teleport':
        Body.setPosition(e.body, { x: params.x, y: params.y });
        Body.setVelocity(e.body, { x: 0, y: 0 });
        break;
      case 'quake':
        for (const o of this._allPieces()) {
          if (!affected(o)) continue;
          const a = Math.random() * Math.PI * 2;
          const v = (prm.minSpeed ?? 2) + Math.random() * ((prm.maxSpeed ?? 5.5) - (prm.minSpeed ?? 2));
          Body.setVelocity(o.body, { x: Math.cos(a) * v, y: Math.sin(a) * v });
          Body.setAngularVelocity(o.body, (Math.random() - 0.5) * 0.15);
        }
        for (const j of this.junk) {
          if (!j.alive) continue;
          const a = Math.random() * Math.PI * 2;
          Body.setVelocity(j.body, { x: Math.cos(a) * 3, y: Math.sin(a) * 3 });
        }
        this._startMotion('settling');
        break;
      // ---- 2026-11-08 のカード ----
      case 'tameuchi':
        e.powerNext = prm.powerScale ?? 2;
        break;
      case 'cushion':
        this.turn.cushion = prm.bounce ?? 0.75;
        break;
      case 'pierce':
        this.turn.pierce = true;
        break;
      case 'bowling':
        this.turn.bowling = true;
        break;
      case 'invisible':
        e.invisLeft = traitOf(e).id === 'clear' ? prm.clearTurns ?? 3 : prm.turns ?? 2;
        break;
      case 'pencase':
        e.shield = true;
        break;
      case 'extralife':
        e.extraLife = true;
        break;
      case 'crumbs':
        this.waxZones.push({ x: params.x, y: params.y, r: prm.radius ?? 80, scale: prm.frictionScale ?? 2.4, owner: i, kind: 'crumbs' });
        break;
      case 'reverse':
        this.erasers[target].reverseNext = true;
        break;
      case 'shrinkbeam': {
        const o = this.erasers[target];
        this._setSize(o, { sizeScale: prm.sizeScale ?? 0.6, massScale: prm.massScale ?? 0.6 });
        o.sizeLeft = prm.turns ?? 2;
        break;
      }
      case 'thief':
        break; // うばうのは 下（カードを使ったあと）
      case 'jump':
        this.turn.jump = prm.airMs ?? 420;
        break;
      case 'center': {
        // 机のまんなかへ すべらせる（止まったら そのまま弾ける）
        const pos = e.body.position;
        const dist = Math.hypot(pos.x, pos.y);
        if (dist > 5 && !e.body.isStatic) {
          const d = Math.min(dist * (prm.ratio ?? 0.5), prm.maxDist ?? 170);
          const v = Math.sqrt(2 * PHYSICS.kineticDecel * this.desk.frictionScale * d) * 1.15;
          Body.setVelocity(e.body, { x: (-pos.x / dist) * v, y: (-pos.y / dist) * v });
          this._startMotion('settling');
        }
        break;
      }
      case 'rewind':
        Body.setPosition(e.body, { x: e.prevTurnPos.x, y: e.prevTurnPos.y });
        Body.setVelocity(e.body, { x: 0, y: 0 });
        break;
      case 'tilt': {
        // いちばん ふちに近い相手のほうへ かたむける
        let worst = null;
        for (const o of this.erasers) {
          if (!o.alive || o.playerIndex === i) continue;
          const c = edgeClearance(this.desk, o.body.position.x, o.body.position.y);
          if (!worst || c < worst.c) worst = { o, c };
        }
        const tp = worst ? worst.o.body.position : { x: 1, y: 0 };
        const l = Math.hypot(tp.x, tp.y) || 1;
        this.tilt = { x: tp.x / l, y: tp.y / l, untilTurn: this.turnCount + (prm.turns ?? 2), drift: prm.drift ?? 0.03 };
        for (const o of this._allPieces()) {
          if (!affected(o)) continue;
          const k = (prm.push ?? 2.6) * (0.8 + Math.random() * 0.4);
          Body.setVelocity(o.body, { x: o.body.velocity.x + this.tilt.x * k, y: o.body.velocity.y + this.tilt.y * k });
        }
        this._startMotion('settling');
        break;
      }
      case 'blackout':
        this.blackout = { fromTurn: this.turnCount + 1, untilTurn: this.turnCount + 2 };
        break;
      case 'roulette':
        break; // 下で 1枚ひく
      case 'shuffle': {
        const list = this._allPieces().filter((o) => affected(o));
        const spots = list.map((o) => ({ ...o.body.position }));
        // ちがう場所になるまで まぜる
        for (let t = 0; t < 10; t++) {
          for (let k = spots.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1));
            [spots[k], spots[j]] = [spots[j], spots[k]];
          }
          if (spots.every((q, k) => q.x !== list[k].body.position.x || q.y !== list[k].body.position.y)) break;
        }
        const margin = prm.edgeMargin ?? 60;
        list.forEach((o, k) => {
          const q = edgeClearance(this.desk, spots[k].x, spots[k].y) < margin ? clampInside(this.desk, spots[k].x, spots[k].y, margin) : spots[k];
          Body.setPosition(o.body, q);
          Body.setVelocity(o.body, { x: 0, y: 0 });
        });
        this._startMotion('settling'); // 重なっていたら、すこし おしあって はなれる
        break;
      }
      case 'blackhole': {
        this.blackHole = {
          x: 0, y: 0, r: prm.radius ?? 24, R: prm.range ?? 190, pull: prm.pull ?? 0.09,
          untilTurn: this.turnCount + (prm.turns ?? 2),
        };
        for (const o of this._allPieces()) {
          if (!o.alive || o.body.isStatic) continue;
          const d = Math.hypot(o.body.position.x, o.body.position.y);
          if (d > this.blackHole.R || d < 1) continue;
          const v = (prm.push ?? 3.5) * (1 - d / this.blackHole.R);
          Body.setVelocity(o.body, { x: (-o.body.position.x / d) * v, y: (-o.body.position.y / d) * v });
        }
        this._startMotion('settling');
        break;
      }
      case 'seating':
        for (const c of params.seats) {
          const o = this.pieceByPid(c.pid);
          if (!o) continue;
          if (o.body.isStatic) {
            Body.setStatic(o.body, false);
            o.anchored = false;
            o.anchorPending = true; // おもりは つづける
            this._applyMass(o);
          }
          Body.setPosition(o.body, { x: c.x, y: c.y });
          Body.setVelocity(o.body, { x: 0, y: 0 });
          Body.setAngularVelocity(o.body, 0);
        }
        break;
      case 'hazure':
      default:
        break;
    }

    p.card.used = true;
    // カードどろぼう：相手のカードを うばう（使うまえに 相手のカードを 見ておく）
    let stolen = null;
    if (def.id === 'thief') {
      stolen = this.players[target].card.def;
      this.players[target].card.used = true;
    }
    this._emit('card', { playerIndex: i, card: def, params, target });

    if (stolen) {
      p.card = { def: stolen, used: false };
      this._emit('newCard', { playerIndex: i, cards: [stolen], from: target });
      return { ok: true };
    }
    // ルーレット：ほかのカードを1枚ひいて、すぐ使える
    if (def.id === 'roulette') {
      const c = drawRandomCard(['roulette', 'okawari']);
      p.card = { def: c, used: false };
      this._emit('newCard', { playerIndex: i, cards: [c], roulette: true });
      return { ok: true };
    }
    // ためうち：このターンは おしまい（弾かない）
    if (def.id === 'tameuchi') {
      this._emit('cardFx', { type: 'charging', playerIndex: i, x: e.body.position.x, y: e.body.position.y });
      this._endTurn();
      return { ok: true };
    }

    // おかわり：カードを何枚かひいて、このターンにそのまま使える（1枚使うと次のカードに）
    if (def.id === 'okawari') {
      const cards = [];
      for (let k = 0; k < (prm.draw ?? 2); k++) cards.push(drawRandomCard(['okawari', 'roulette']));
      p.card = { def: cards[0], used: false };
      p.cardQueue = cards.slice(1);
      this._emit('newCard', { playerIndex: i, cards });
    } else if (p.cardQueue?.length) {
      p.card = { def: p.cardQueue.shift(), used: false };
      this._emit('nextCard', { playerIndex: i, card: p.card.def });
    }
    return { ok: true };
  }

  /** 大きさを変える（ビッグ・ちびっこ）。prm が null なら元にもどす */
  _setSize(e, prm) {
    const wasStatic = e.body.isStatic;
    if (wasStatic) Body.setStatic(e.body, false);
    if (e.size !== 1) {
      Body.scale(e.body, 1 / e.size, 1 / e.size);
      e.size = 1;
      e.cardMass = 1;
    }
    if (prm) {
      const k = prm.sizeScale ?? 1.5;
      Body.scale(e.body, k, k);
      e.size = k;
      e.cardMass = prm.massScale ?? 1;
    }
    this._applyMass(e);
    if (wasStatic) Body.setStatic(e.body, true);
  }

  _addPencil(x, y, angle, prm) {
    const length = prm.length ?? 150;
    const width = prm.width ?? 14;
    const look = prm.look || 'pencil';
    const body = Bodies.rectangle(x, y, length, width, {
      isStatic: true,
      angle,
      restitution: 0.6,
      friction: 0.05,
      chamfer: { radius: 4 },
    });
    body.label = 'pencil';
    Composite.add(this.engine.world, body);
    this.pencils.push({ body, length, width, look, color: prm.color || null, alive: true, fall: null });
  }

  _pencilEnds(pc) {
    const { x, y } = pc.body.position;
    const c = Math.cos(pc.body.angle) * (pc.length / 2);
    const s = Math.sin(pc.body.angle) * (pc.length / 2);
    return [{ x: x - c, y: y - s }, { x: x + c, y: y + s }];
  }

  // ---- 外れたパーツ・カバー ----
  /** 机の上にころがるもの（パーツ・カバー）を1つ置く */
  _addJunk({ x, y, angle = 0, w, h, color, kind, vx = 0, vy = 0, av = 0, jid }) {
    const body = Bodies.rectangle(x, y, w, h, {
      angle,
      frictionAir: 0.05,
      restitution: 0.4,
      friction: 0.3,
      chamfer: { radius: Math.min(3, Math.min(w, h) / 2 - 0.5) },
    });
    Body.setMass(body, (w * h) / 300); // 小さくて軽い（消しゴムは 4〜5）
    Body.setVelocity(body, { x: vx, y: vy });
    Body.setAngularVelocity(body, av);
    body.label = 'junk';
    Composite.add(this.engine.world, body);
    const j = { jid: jid ?? this._nextJid++, kind, w, h, color, body, alive: true, fall: null };
    this.junk.push(j);
    return j;
  }

  /** ぶつかったときに外れたものを、物理の計算が終わってから机に置く */
  _spawnJunk() {
    const q = this._junkQueue;
    if (!q.length) return;
    this._junkQueue = [];
    for (const d of q) {
      const e = d.from;
      if (!e.alive) continue;
      const p = e.body.position;
      // 当たった相手と反対のがわ（なければ当たったところのほう）に、はじき出す
      let ax = p.x - (d.other ? d.other.body.position.x : d.x);
      let ay = p.y - (d.other ? d.other.body.position.y : d.y);
      if (!d.other) [ax, ay] = [-ax, -ay];
      const base = Math.atan2(ay, ax) || 0;
      const w = d.w * e.size;
      const h = d.h * e.size;
      const r = Math.hypot(w, h) / 2;
      let spot = null;
      for (const da of [0.6, -0.6, 1.2, -1.2, 0, 2, -2, Math.PI]) {
        const a = base + da;
        const dist = this.pieceExtent(e) + r + 3;
        const q2 = { x: p.x + Math.cos(a) * dist, y: p.y + Math.sin(a) * dist, a };
        const hit =
          this._allPieces().some((o) => o.alive && o !== e && Math.hypot(o.body.position.x - q2.x, o.body.position.y - q2.y) < this.pieceExtent(o) + r) ||
          this.junk.some((j) => j.alive && Math.hypot(j.body.position.x - q2.x, j.body.position.y - q2.y) < r + Math.hypot(j.w, j.h) / 2);
        if (!hit) {
          spot = q2;
          break;
        }
      }
      if (!spot) continue; // すきまがなければ、こなごなになった（置かない）
      const sp = 1.5 + Math.min(4, e.body.speed * 0.5);
      this._addJunk({
        x: spot.x, y: spot.y, angle: e.body.angle + (Math.random() - 0.5),
        w, h, color: d.color, kind: d.kind,
        vx: e.body.velocity.x * 0.5 + Math.cos(spot.a) * sp,
        vy: e.body.velocity.y * 0.5 + Math.sin(spot.a) * sp,
        av: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  // ---- 時間を進める ----
  step(dt) {
    this.time += dt;
    if (this.phase !== 'over') {
      this._applyTraitsBeforeStep(dt);
      this._applySteer(dt);
      this._applyDeskBrake(dt);
      Engine.update(this.engine, dt);
      this._hatchEggs();
      this._spawnJunk();
      this._iceTrail();
      this._updateGhosts();
      this._updateAir();
      this._checkFalls();
    }
    this._updateFalls(dt);

    const fallsDone = [...this.erasers, ...this.debris].every((e) => !e.fall || e.fall.t >= GAME.fallAnimMs);

    if (this.phase === 'moving' || this.phase === 'settling') {
      this._movingMs += dt;
      const moving = [...this._allPieces(), ...this.junk].some(
        (e) =>
          e.alive && !e.body.isStatic &&
          (e.body.speed > PHYSICS.stopSpeed ||
            Math.abs(e.body.angularVelocity) > PHYSICS.stopAngularSpeed),
      );
      this._stillFrames = moving ? 0 : this._stillFrames + 1;
      const stopped = this._stillFrames >= PHYSICS.stopFrames || this._movingMs > PHYSICS.maxTurnMs;
      if (stopped && fallsDone) {
        if (this.phase === 'settling') this._resume();
        else this._finishShot();
      }
    } else if (this.phase === 'shrinking' && fallsDone) {
      if (!this._checkOver()) this._advance();
    }
  }

  _startMotion(phase) {
    this.phase = phase;
    this._stillFrames = 0;
    this._movingMs = 0;
  }

  // カーブのカード：指でなぞった向きに少しずつ曲げる
  // じしゃくのカード：一番近い相手に向かって少しずつ曲がる
  _applySteer(dt) {
    this._applyHoming(dt);
    const c = this.turn.curve;
    const st = this.turn.steer;
    if (this.phase !== 'moving' || !c || !st || c.budgetMs <= 0) return;
    const e = this.erasers[this.turnIndex];
    if (!e.alive) return;
    this._accelerate(e, st.x * c.accel, st.y * c.accel, dt);
    c.budgetMs -= dt;
  }

  _accelerate(e, ax, ay, dt) {
    const k = dt / BASE_DT;
    const b = e.body;
    let vx = b.velocity.x + ax * k;
    let vy = b.velocity.y + ay * k;
    const sp = Math.hypot(vx, vy);
    const max = e.maxSpeed * 1.1;
    if (sp > max) {
      vx *= max / sp;
      vy *= max / sp;
    }
    Body.setVelocity(b, { x: vx, y: vy });
  }

  _applyHoming(dt) {
    const h = this.turn.homing;
    if (this.phase !== 'moving' || !h || h.budgetMs <= 0) return;
    const e = this.erasers[this.turnIndex];
    if (!e.alive) return;
    const me = e.body.position;
    let best = null;
    let bestD = Infinity;
    for (const o of this._allPieces()) {
      if (!o.alive || o.playerIndex === e.playerIndex) continue;
      const d = Math.hypot(o.body.position.x - me.x, o.body.position.y - me.y);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    }
    if (!best) return;
    const ux = (best.body.position.x - me.x) / (bestD || 1);
    const uy = (best.body.position.y - me.y) / (bestD || 1);
    this._accelerate(e, ux * h.accel, uy * h.accel, dt);
    h.budgetMs -= dt;
  }

  // ---- とくせい ----
  // ぶつかったときに決めた「すいこむ」「はね返す」を、つぎのコマで反映する。ブルブルのしんどうもここ
  _applyTraitsBeforeStep(dt) {
    for (const e of this._allPieces()) {
      if (!e.alive || e.body.isStatic) continue;
      const b = e.body;
      if (e.absorbNext) {
        Body.setVelocity(b, { x: b.velocity.x * e.absorbNext, y: b.velocity.y * e.absorbNext });
        Body.setAngularVelocity(b, b.angularVelocity * e.absorbNext);
        e.absorbNext = 0;
      }
      if (e.pushNext) {
        Body.setVelocity(b, { x: b.velocity.x + e.pushNext.x, y: b.velocity.y + e.pushNext.y });
        e.pushNext = null;
      }
    }
    // ブルブル：弾いたあと、止まりかけても少し前に進む
    const cur = this.erasers[this.turnIndex];
    const t = traitOf(cur);
    if (this.phase === 'moving' && cur.alive && t.id === 'vibrate' && this.time - this.turn.flickAt < (t.ms ?? 900)) {
      const sp = cur.body.speed;
      if (sp > 0.15 && sp < 5) {
        const ux = cur.body.velocity.x / sp;
        const uy = cur.body.velocity.y / sp;
        this._accelerate(cur, ux * (t.accel ?? 0.12), uy * (t.accel ?? 0.12), dt);
      }
    }
    const k = dt / BASE_DT;
    const motion = this.phase === 'moving' || this.phase === 'settling';
    for (const e of this._allPieces()) {
      if (!e.alive || e.body.isStatic) continue;
      // つらぬき：当てたあとも いきおいを たもつ
      if (e.pierceUntil > this.time && e.pierceDir) {
        const left = (e.pierceUntil - this.time) / (e.pierceMs || 600);
        const want = e.pierceSpeed * (e.pierceKeep || 0.9) * (0.4 + 0.6 * left);
        if (e.body.speed < want) Body.setVelocity(e.body, { x: e.pierceDir.x * want, y: e.pierceDir.y * want });
      }
      // ショウジョウヅツ：自分で弾いて 転がっているあいだは 向きが かわらない（転がる向きに まっすぐ）
      // 当てられたときは ふつうに動く
      if (traitOf(e).id === 'tube' && e.body.speed > 0.2 && this.phase === 'moving' && e.playerIndex === this.turnIndex) {
        const [ux, uy] = this._tubeDir(e, e.body.velocity.x, e.body.velocity.y);
        const along = e.body.velocity.x * ux + e.body.velocity.y * uy;
        Body.setVelocity(e.body, { x: ux * along, y: uy * along });
        Body.setAngularVelocity(e.body, 0);
      }
      // かたむき：動いている消しゴムは 低いほうへ すこし すべる（クロケシは へいき）
      if (this.tilt && motion && e.body.speed > 0.3 && !this._guarded(e, -1)) {
        const a = this.tilt.drift * k;
        Body.setVelocity(e.body, { x: e.body.velocity.x + this.tilt.x * a, y: e.body.velocity.y + this.tilt.y * a });
      }
      // ブラックホール：近くで 動いている消しゴムを すいよせる
      const bh = this.blackHole;
      if (bh && motion && e.body.speed > 0.2) {
        const dx = bh.x - e.body.position.x;
        const dy = bh.y - e.body.position.y;
        const d = Math.hypot(dx, dy);
        if (d < bh.R && d > 1) {
          const a = bh.pull * (1 - d / bh.R) * k;
          Body.setVelocity(e.body, { x: e.body.velocity.x + (dx / d) * a, y: e.body.velocity.y + (dy / d) * a });
        }
      }
      const et = traitOf(e);
      // ロケッター：ブースト中は まっすぐ 加速する（回らない）
      if (e.boostUntil > this.time) {
        const sp = e.body.speed;
        if (sp > 0.5) {
          const a = (et.accel ?? 0.32) * k;
          const v2 = Math.min(e.maxSpeed * 1.35, sp + a) / sp;
          Body.setVelocity(e.body, { x: e.body.velocity.x * v2, y: e.body.velocity.y * v2 });
        }
        Body.setAngularVelocity(e.body, 0);
      }
      // キョウリュウ：当てたすこしあとに、しっぽで もう1回 押す
      if (e.tailTarget && this.time >= e.tailAt) {
        const o = e.tailTarget;
        e.tailTarget = null;
        if (o.alive && !o.body.isStatic) {
          const dx = o.body.position.x - e.body.position.x;
          const dy = o.body.position.y - e.body.position.y;
          const d = Math.hypot(dx, dy) || 1;
          const p = et.push ?? 3.2;
          Body.setVelocity(o.body, { x: o.body.velocity.x + (dx / d) * p, y: o.body.velocity.y + (dy / d) * p });
          this._emit('trait', { type: 'tail', playerIndex: e.playerIndex, x: o.body.position.x, y: o.body.position.y });
        }
      }
      // ジシャクン：近くを動いている相手を、すこし 引きよせる
      if (et.id === 'magnet' && (this.phase === 'moving' || this.phase === 'settling')) {
        const R = et.range ?? 150;
        for (const o of this._allPieces()) {
          if (!o.alive || o.playerIndex === e.playerIndex || o.body.isStatic || o.body.speed < 0.4) continue;
          const dx = e.body.position.x - o.body.position.x;
          const dy = e.body.position.y - o.body.position.y;
          const d = Math.hypot(dx, dy);
          if (d > R || d < 1) continue;
          const a = (et.accel ?? 0.12) * (1 - d / R) * k;
          Body.setVelocity(o.body, { x: o.body.velocity.x + (dx / d) * a, y: o.body.velocity.y + (dy / d) * a });
        }
      }
    }
  }

  // その場所のすべりやすさ（ワックスがけの中は小さくなる。クロケシは相手のワックスがきかない）
  _localFriction(e) {
    const { x, y } = e.body.position;
    let lo = 1; // つるつる（ワックス・こおり）
    let hi = 1; // ざらざら（けしくず）
    for (const z of this.waxZones) {
      if (this._guarded(e, z.owner)) continue;
      if (z.kind === 'ice' && z.by === e.playerIndex) continue; // アイスケシは 自分の こおりでは すべらない
      if ((x - z.x) ** 2 + (y - z.y) ** 2 > z.r * z.r) continue;
      if (z.scale < 1) lo = Math.min(lo, z.scale);
      else hi = Math.max(hi, z.scale);
    }
    return lo * hi;
  }

  // 机とのこすれ：速さから毎コマ一定量を引く（遅くなるとピタッと止まる）
  // 回転していると、進む向きが少し曲がる
  _applyDeskBrake(dt) {
    const k = dt / BASE_DT;
    for (const e of this._allPieces()) {
      if (!e.alive || e.body.isStatic) continue;
      const b = e.body;
      const t = traitOf(e);
      // ワックスがけ・すべりどめ・とくせい（ブレーキ・ふんばり）・カバーやパーツ
      let local = this._localFriction(e) * (e.grip || 1) * e.frictionMul;
      if (t.id === 'brake') local *= t.scale ?? 1;
      if (t.slide && t.id !== 'crown' && t.id !== 'glow') local *= t.slide; // キンメダル・ハナマルン・ショウジョウヅツ
      if (t.id === 'crown') {
        // オウカン：縁の近くでは トゲで 粘る。それ以外は よく転がる
        local *= edgeClearance(this.desk, b.position.x, b.position.y) < (t.range ?? 50) ? t.grip ?? 4 : t.slide ?? 0.8;
      }
      if (e.toppleUntil > this.time) local *= t.rollSlide ?? 0.55; // トロフィン：倒れて 転がっている
      if (t.id === 'edgeGrip' && edgeClearance(this.desk, b.position.x, b.position.y) < (t.range ?? 45)) {
        local *= t.scale ?? 3.5;
      }
      b.frictionAir = Math.min(0.5, e.baseFrictionAir * local);
      const brake = k * this.desk.frictionScale * local;

      let vx = b.velocity.x;
      let vy = b.velocity.y;
      const w = b.angularVelocity;
      const s = Math.hypot(vx, vy);
      if (s > 0.2 && Math.abs(w) > 0.001) {
        const a = PHYSICS.spin.curve * w * k;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        [vx, vy] = [vx * c - vy * sn, vx * sn + vy * c];
      }
      if (s > 0) {
        const r = Math.max(0, s - PHYSICS.kineticDecel * brake) / s;
        Body.setVelocity(b, { x: vx * r, y: vy * r });
      }
      if (w !== 0) {
        // Matter.js は回転にも frictionAir をかけるので、その分を spin.damping の割合まで弱める
        const damping = t.id === 'spinny' ? t.damping ?? 0.3 : PHYSICS.spin.damping;
        const fa = b.frictionAir;
        const keep = (1 - fa * damping) / (1 - fa);
        const w2 = Math.sign(w) * Math.max(0, Math.abs(w) - PHYSICS.angularDecel * brake) * keep;
        Body.setAngularVelocity(b, w2);
      }
    }
    // 外れたパーツ・カバーも、こすれて止まる（ワックスの上はよくすべる）
    for (const j of this.junk) {
      if (!j.alive) continue;
      const b = j.body;
      const brake = k * this.desk.frictionScale * this._localFriction(j) * 1.5;
      const s = b.speed;
      if (s > 0) {
        const r = Math.max(0, s - PHYSICS.kineticDecel * brake) / s;
        Body.setVelocity(b, { x: b.velocity.x * r, y: b.velocity.y * r });
      }
      const w = b.angularVelocity;
      if (w !== 0) Body.setAngularVelocity(b, Math.sign(w) * Math.max(0, Math.abs(w) - PHYSICS.angularDecel * brake * 2));
    }
  }

  _onCollision(ev) {
    for (const pair of ev.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const power = Math.max(a.speed || 0, b.speed || 0);
      if (power < 1.2) continue;
      const sup = pair.collision?.supports?.[0];
      const x = sup ? sup.x : (a.position.x + b.position.x) / 2;
      const y = sup ? sup.y : (a.position.y + b.position.y) / 2;
      // ぶつかった消しゴムを、くるっと回す（強く当たるほど大きく）
      const kick = PHYSICS.spin.hitKick * Math.min(1, power / 15);
      for (const body of [a, b]) {
        if (body.isStatic || body.label !== 'eraser') continue;
        const k = kick * (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
        Body.setAngularVelocity(body, body.angularVelocity + k);
      }
      // とくせい
      const pa = a.plugin?.piece;
      const pb = b.plugin?.piece;
      // 守りのとくせい（ニンジャ・ユウレイ・カガミン）・ふでばこ：ぶつかったこと自体を なかったことにする
      if (pa && pb && (this._defend(pair, pa, pb, power) || this._defend(pair, pb, pa, power))) continue;
      if (pa && pb && this.phase === 'moving') this._cardHit(pair, pa, pb);
      if (pa) this._traitHit(pa, pb, power, x, y);
      if (pb) this._traitHit(pb, pa, power, x, y);
      this._emit('hit', { x, y, power, pencil: a.label === 'pencil' || b.label === 'pencil' });
    }
  }

  /**
   * e が相手 o に当てられたときの、1回だけの守り。使ったら true（このぶつかりは なかったことになる）
   * ニンジャケシ：よこへ よける／ユウレイケシ：この番のあいだ すりぬける／カガミン：力を そのまま返す
   */
  _defend(pair, e, o, power) {
    // ふでばこ（カード）：1回だけ 当たりを ふせぐ
    if (e.shield && e.alive && o.playerIndex !== e.playerIndex && o.body.speed > e.body.speed + 0.3 && power >= 1.5) {
      e.shield = false;
      pair.isActive = false;
      const b = findCard('pencase')?.params?.bounce ?? 0.35;
      Body.setVelocity(o.body, { x: -o.body.velocity.x * b, y: -o.body.velocity.y * b });
      Body.setVelocity(e.body, { x: 0, y: 0 });
      // はなれるまで すりぬけて、おしこまれないようにする
      e.ghost = true;
      e.ghostEnd = true;
      e.body.collisionFilter.mask = 0;
      this._emit('cardFx', { type: 'shield', playerIndex: e.playerIndex, x: e.body.position.x, y: e.body.position.y });
      return true;
    }
    const t = traitOf(e);
    if (!['dodge', 'ghost', 'mirror'].includes(t.id) || e.defUsed || !e.alive) return false;
    if (o.playerIndex === e.playerIndex || power < (t.minPower ?? 2.5)) return false;
    if (o.body.speed <= e.body.speed + 0.3) return false; // 当てられたほうのときだけ
    e.defUsed = true;
    pair.isActive = false; // このぶつかりは なし
    const p = { x: e.body.position.x, y: e.body.position.y };
    if (t.id === 'dodge') {
      // 相手の進む向きと 直角に よける（机の外や ほかの消しゴムの上には よけない）
      const sp = o.body.speed || 1;
      const nx = -o.body.velocity.y / sp;
      const ny = o.body.velocity.x / sp;
      const d = this.pieceExtent(e) * 2 + this.pieceExtent(o) * 0.6;
      let spot = null;
      for (const s of [1, -1, 1.5, -1.5]) {
        const q = { x: p.x + nx * d * s, y: p.y + ny * d * s };
        if (!isInsideDesk(this.desk, q.x, q.y) || edgeClearance(this.desk, q.x, q.y) < this.pieceExtent(e)) continue;
        const busy = this._allPieces().some(
          (x) => x.alive && x !== e && Math.hypot(x.body.position.x - q.x, x.body.position.y - q.y) < this.pieceExtent(x) + this.pieceExtent(e) + 4,
        );
        if (!busy) {
          spot = q;
          break;
        }
      }
      if (spot) Body.setPosition(e.body, spot);
      // よけきれないときも、こんかいは 動かない
      Body.setVelocity(e.body, { x: 0, y: 0 });
      // 相手は そのまま まっすぐ 進むので、すりぬけさせる
      e.ghost = true;
      e.ghostEnd = true;
      e.body.collisionFilter.mask = 0;
      this._emit('trait', { type: 'dodge', playerIndex: e.playerIndex, x: p.x, y: p.y, x2: e.body.position.x, y2: e.body.position.y });
    } else if (t.id === 'ghost') {
      e.ghost = true;
      e.body.collisionFilter.mask = 0; // この番のあいだ、なににも ぶつからない
      Body.setVelocity(e.body, { x: 0, y: 0 });
      this._emit('trait', { type: 'ghost', playerIndex: e.playerIndex, x: p.x, y: p.y });
    } else {
      const r = t.reflect ?? 1;
      Body.setVelocity(o.body, { x: -o.body.velocity.x * r, y: -o.body.velocity.y * r });
      Body.setVelocity(e.body, { x: 0, y: 0 });
      this._emit('trait', { type: 'mirror', playerIndex: e.playerIndex, x: p.x, y: p.y });
    }
    return true;
  }

  /** つらぬき・ボウリング（カード）のぶつかり */
  _cardHit(pair, a, b) {
    const shooter = this.turnIndex;
    // つらぬき：弾いた消しゴムが 相手に当たっても いきおいが へらない
    if (this.turn.pierce) {
      for (const [me, o] of [[a, b], [b, a]]) {
        if (me.playerIndex !== shooter || o.playerIndex === shooter || me.pierceUntil > this.time) continue;
        const sp = me.body.speed;
        if (sp < 1) continue;
        me.pierceSpeed = sp;
        me.pierceDir = { x: me.body.velocity.x / sp, y: me.body.velocity.y / sp };
        me.pierceMs = findCard('pierce')?.params?.ms ?? 600;
        me.pierceKeep = findCard('pierce')?.params?.keep ?? 0.9;
        me.pierceUntil = this.time + me.pierceMs;
        this._emit('cardFx', { type: 'pierce', playerIndex: shooter, x: o.body.position.x, y: o.body.position.y });
      }
    }
    // ショウジョウヅツ：通り道の相手を まとめて押す（当たっても いきおいが へりにくい）
    for (const [me, o] of [[a, b], [b, a]]) {
      const t = traitOf(me);
      if (t.id !== 'tube' || me.playerIndex !== shooter || o.playerIndex === shooter) continue;
      const sp = me.body.speed;
      if (sp < 1) continue;
      me.pierceSpeed = Math.max(sp, me.pierceUntil > this.time ? me.pierceSpeed * 0.85 : 0);
      me.pierceDir = { x: me.body.velocity.x / sp, y: me.body.velocity.y / sp };
      me.pierceMs = t.ms ?? 450;
      me.pierceKeep = t.keep ?? 0.85;
      me.pierceUntil = this.time + me.pierceMs;
    }
    // ボウリング：当てられた相手が ほかの相手に当たると、力が そのまま うつる
    if (this.turn.bowling && a.playerIndex !== shooter && b.playerIndex !== shooter) {
      const [fast, slow] = a.body.speed >= b.body.speed ? [a, b] : [b, a];
      if (fast.body.speed > slow.body.speed + 1 && !slow.body.isStatic) {
        pair.isActive = false;
        Body.setVelocity(slow.body, { x: fast.body.velocity.x, y: fast.body.velocity.y });
        Body.setVelocity(fast.body, { x: fast.body.velocity.x * 0.08, y: fast.body.velocity.y * 0.08 });
        this._emit('cardFx', { type: 'bowling', playerIndex: shooter, x: slow.body.position.x, y: slow.body.position.y });
      }
    }
  }

  /** ジャンプ中なら、着地できるか（だれとも重なっていなければ 着地） */
  _updateAir() {
    for (const e of this._allPieces()) {
      if (!e.airborne || !e.alive || this.time < e.airUntil) continue;
      const overlap = [...this._allPieces(), ...this.junk].some(
        (o) => o !== e && o.alive && o.body && Matter.Collision.collides(e.body, o.body)?.collided,
      ) || this.pencils.some((pc) => pc.alive && Matter.Collision.collides(e.body, pc.body)?.collided);
      if (overlap) continue;
      e.airborne = false;
      if (!e.ghost) e.body.collisionFilter.mask = 0xffffffff;
      this._emit('cardFx', { type: 'land', playerIndex: e.playerIndex, x: e.body.position.x, y: e.body.position.y });
    }
  }

  /** ユウレイ・ニンジャのすりぬけを もどす（番が終わって、だれとも重なっていなければ） */
  _updateGhosts() {
    for (const e of this._allPieces()) {
      if (!e.ghost || !e.ghostEnd || !e.alive) continue;
      const overlap = [...this._allPieces(), ...this.junk].some(
        (o) => o !== e && o.alive && o.body && Matter.Collision.collides(e.body, o.body)?.collided,
      ) || this.pencils.some((pc) => pc.alive && Matter.Collision.collides(e.body, pc.body)?.collided);
      if (overlap) continue;
      e.ghost = false;
      e.ghostEnd = false;
      if (!e.airborne) e.body.collisionFilter.mask = 0xffffffff;
    }
  }

  /** e がぶつかったときのとくせい（o はぶつかった相手の消しゴム。えんぴつなら null） */
  _traitHit(e, o, power, x, y) {
    const t = traitOf(e);
    const pos = e.body.position;
    const away = () => {
      const dx = o.body.position.x - pos.x;
      const dy = o.body.position.y - pos.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d };
    };
    const addPush = (target, dir, amount) => {
      const cur = target.pushNext || { x: 0, y: 0 };
      target.pushNext = { x: cur.x + dir.x * amount, y: cur.y + dir.y * amount };
    };

    switch (t.id) {
      case 'gather': // マトマール：当たるたびに重くなる
        if (power > 2 && e.traitMass < (t.max ?? 1.6)) {
          e.gathered++;
          e.traitMass = Math.min(t.max ?? 1.6, 1 + (t.perHit ?? 0.1) * e.gathered);
          this._applyMass(e);
        }
        break;
      case 'cover': // ガードン：強く当たるとカバーが外れる
        if (e.covered && power >= (t.breakPower ?? 7)) {
          e.covered = false;
          e.traitMass = t.afterMass ?? 0.8;
          e.frictionMul *= t.afterFriction ?? 0.85;
          this._applyMass(e);
          if (t.drop) this._junkQueue.push({ from: e, other: o, x, y, ...t.drop, kind: t.drop.look || 'cover' });
          this._emit('trait', { type: 'coverOff', playerIndex: e.playerIndex, x: pos.x, y: pos.y, look: t.drop?.look || 'cover' });
        }
        break;
      case 'parts': // ガッタイン：強く当たるとパーツが外れる
        if (e.parts > 0 && power >= (t.breakPower ?? 5) && this.time - e.lastBreakAt > 300) {
          e.parts--;
          e.lastBreakAt = this.time;
          e.traitMass *= t.massStep ?? 0.82;
          e.frictionMul *= t.frictionStep ?? 0.9;
          e.maxSpeed *= t.speedStep ?? 1;
          this._applyMass(e);
          const drop = t.drops?.[e.parts];
          if (drop) this._junkQueue.push({ from: e, other: o, x, y, ...drop, kind: 'part' });
          this._emit('trait', { type: 'partOff', playerIndex: e.playerIndex, x: pos.x, y: pos.y, left: e.parts });
        }
        break;
      case 'absorb': // グニャット：当てられると勢いを吸い込む
        if (o && o.body.speed > e.body.speed) {
          e.absorbNext = t.keep ?? 0.4;
          e.squishAt = this.time;
        }
        break;
      case 'bouncy': // ポヨン・トゲトゲン：当たった相手を はね返す
        if (o && !o.body.isStatic) addPush(o, away(), Math.min(t.max ?? 8, Math.max(t.min ?? 0, (t.push ?? 0.5) * power)));
        break;
      case 'twoTone': // ツートン：赤い側（前）は強く押す、青い側（後ろ）は動きにくい
        if (o) {
          const c = Math.cos(-e.body.angle);
          const s = Math.sin(-e.body.angle);
          const lx = (x - pos.x) * c - (y - pos.y) * s;
          if (lx > 0) {
            if (!o.body.isStatic) addPush(o, away(), Math.min(t.max ?? 8, (t.attack ?? 0.45) * power));
          } else if (o.body.speed > e.body.speed) {
            e.absorbNext = t.defend ?? 0.5;
          }
        }
        break;
      case 'confuse': // フルーツン：当たった相手は、次に弾く向きが反対
        if (o && o.playerIndex !== e.playerIndex && power > 2 && !o.confused) {
          o.confused = true;
          this._emit('trait', { type: 'confuse', playerIndex: o.playerIndex, x: o.body.position.x, y: o.body.position.y });
        }
        break;
      case 'tail': // キョウリュウ：自分の番に当てたら、しっぽで もう1回（1番に1回）
        if (o && o.playerIndex !== e.playerIndex && this._isShooter(e) && !this.turn.tailDone && power > 2) {
          this.turn.tailDone = true;
          e.tailAt = this.time + (t.delayMs ?? 220);
          e.tailTarget = o;
        }
        break;
      case 'corner': // マッサラ：最初に 相手に当てた 一撃だけ 超強力
        if (o && o.playerIndex !== e.playerIndex && this._isShooter(e) && !e.cornerUsed && power > 2 && !o.body.isStatic) {
          e.cornerUsed = true;
          addPush(o, away(), Math.min(t.max ?? 9, (t.push ?? 0.8) * power));
          this._emit('trait', { type: 'corner', playerIndex: e.playerIndex, x, y });
        }
        break;
      case 'topple': // トロフィン：前と後ろは 押されにくい。横から当てられると 倒れて転がる
        if (o && o.playerIndex !== e.playerIndex && o.body.speed > e.body.speed) {
          const c = Math.cos(-e.body.angle);
          const sn = Math.sin(-e.body.angle);
          const lx = (x - pos.x) * c - (y - pos.y) * sn;
          const ly = (x - pos.x) * sn + (y - pos.y) * c;
          if (Math.abs(ly) * 1.25 >= Math.abs(lx)) {
            const dx = pos.x - o.body.position.x;
            const dy = pos.y - o.body.position.y;
            const d = Math.hypot(dx, dy) || 1;
            addPush(e, { x: dx / d, y: dy / d }, Math.min(t.sideMax ?? 4, (t.sidePush ?? 0.25) * power));
            if (e.toppleUntil < this.time && power > 3) this._emit('trait', { type: 'topple', playerIndex: e.playerIndex, x: pos.x, y: pos.y });
            e.toppleUntil = this.time + (t.ms ?? 1200);
          } else {
            e.absorbNext = t.front ?? 0.55;
          }
        }
        break;
      case 'medal': // キンメダル：当てた相手を くるっと 回す
        if (o && o.playerIndex !== e.playerIndex && e.body.speed >= o.body.speed && !o.body.isStatic) {
          const k = (t.spinKick ?? 0.45) * Math.min(1, power / 8) * (Math.random() < 0.5 ? -1 : 1);
          Body.setAngularVelocity(o.body, o.body.angularVelocity + k);
        }
        break;
      case 'hanamaru': // ハナマルン：1試合に1回、当てた相手に はなまる（次の番 動けない）
        // スタンプなので、ポンと やさしく当てたときだけ（強すぎると はなまるに ならない）
        if (o && o.playerIndex !== e.playerIndex && this._isShooter(e) && !e.stampUsed && power > 1.5 && power <= (t.maxPower ?? 6) && o.alive) {
          e.stampUsed = true;
          o.happy = true;
          this.players[o.playerIndex].skipNext = true;
          this._emit('trait', { type: 'hanamaru', playerIndex: o.playerIndex, x: o.body.position.x, y: o.body.position.y });
        }
        break;
      case 'egg': // タマゴン：強く当たると からがわれて、他の消しゴムが出てくる
        if (!e.hatched && power >= (t.breakPower ?? 6)) {
          e.hatched = true;
          this._hatchQueue.push(e);
        }
        break;
      default:
        break;
    }
  }

  /** e が いま弾いている人の消しゴムか */
  _isShooter(e) {
    return this.phase === 'moving' && e.playerIndex === this.turnIndex;
  }

  /** タマゴン：からが われて、中から ランダムで ほかの消しゴムが出てくる */
  _hatchEggs() {
    const q = this._hatchQueue;
    if (!q.length) return;
    this._hatchQueue = [];
    for (const egg of q) {
      if (!egg.alive) continue;
      const i = egg.playerIndex;
      const pool = REGULAR_ERASERS;
      const def = pool[Math.floor(Math.random() * pool.length)];
      const b = egg.body;
      const n = this._makePiece(def, i, b.position.x, b.position.y, b.angle);
      Body.setVelocity(n.body, b.velocity);
      Body.setAngularVelocity(n.body, b.angularVelocity);
      // カードの効果などは そのまま 引きつぐ（大きさは もとにもどる）
      for (const k of ['confused', 'hold', 'holdUntil', 'grip', 'gripPending', 'gripScale', 'anchorPending', 'clear',
        'invisLeft', 'shield', 'extraLife', 'reverseNext', 'powerNext', 'curTurnPos', 'prevTurnPos']) n[k] = egg[k];
      n.hatched = true;
      n.isExtra = egg.isExtra;
      Composite.remove(this.engine.world, b);
      egg.alive = false;
      if (this.erasers[i] === egg) this.erasers[i] = n;
      else this.extras = this.extras.map((x) => (x === egg ? n : x));
      // われた から（机にころがる）
      for (const s of [1, -1]) {
        this._junkQueue.push({ from: n, other: null, x: b.position.x + s * 30, y: b.position.y + s * 10, w: 22, h: 14, color: '#fff8e1', kind: 'shell' });
      }
      this._emit('trait', { type: 'hatch', playerIndex: i, x: b.position.x, y: b.position.y, name: def.name });
    }
  }

  /** アイスケシ：自分が弾いて 通ったところを こおらせる（古いところから とける） */
  _iceTrail() {
    if (this.phase !== 'moving') return;
    for (const e of this._allPieces()) {
      const t = traitOf(e);
      if (t.id !== 'ice' || !e.alive || e.playerIndex !== this.turnIndex || e.body.speed < 0.6) continue;
      const p = e.body.position;
      if (e.lastIce && Math.hypot(p.x - e.lastIce.x, p.y - e.lastIce.y) < (t.spacing ?? 34)) continue;
      if (!isInsideDesk(this.desk, p.x, p.y)) continue;
      e.lastIce = { x: p.x, y: p.y };
      this.waxZones.push({ x: p.x, y: p.y, r: t.radius ?? 30, scale: t.scale ?? 0.45, owner: e.playerIndex, kind: 'ice', by: e.playerIndex });
      const mine = this.waxZones.filter((z) => z.kind === 'ice' && z.by === e.playerIndex);
      if (mine.length > (t.max ?? 14)) this.waxZones.splice(this.waxZones.indexOf(mine[0]), 1);
    }
  }

  /** パカッター：ふちの近くで自分の番が来たら、2つに分かれる */
  _trySplit(i) {
    const e = this.erasers[i];
    const t = traitOf(e);
    if (t.id !== 'split' || e.splitDone || !e.alive) return;
    const p = e.body.position;
    if (edgeClearance(this.desk, p.x, p.y) >= (t.pinch ?? 75)) return;

    if (e.size !== 1) {
      this._setSize(e, null);
      e.sizeLeft = 0;
    }
    if (e.anchored) {
      Body.setStatic(e.body, false);
      e.anchored = false;
    }

    // 半分の大きさの消しゴム
    const k = t.pieceScale ?? 0.62;
    const s = e.def.shape;
    const halfShape =
      s.type === 'rect'
        ? { ...s, w: s.w * k, chamfer: Math.min(s.chamfer || 0, (s.w * k) / 2) }
        : { ...s, radius: s.radius * Math.sqrt(k) };
    const halfDef = { ...e.def, shape: halfShape, look: { ...e.def.look, half: true } };
    const ext = eraserExtent(halfDef);

    // かけらを置く場所：机のまん中のほうへ
    const dc = Math.hypot(p.x, p.y) || 1;
    const base = Math.atan2(-p.y / dc, -p.x / dc);
    let spot = null;
    for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
      const a = base + da;
      const d = ext * 2 + 8;
      const q = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
      if (!isInsideDesk(this.desk, q.x, q.y) || edgeClearance(this.desk, q.x, q.y) < ext) continue;
      const hit = this._allPieces().some(
        (o) => o.alive && o !== e && Math.hypot(o.body.position.x - q.x, o.body.position.y - q.y) < ext + this.pieceExtent(o) + 4,
      );
      if (!hit) {
        spot = q;
        break;
      }
    }
    if (!spot) return; // すきまがなければ、分かれない

    const angle = e.body.angle;
    Composite.remove(this.engine.world, e.body);
    const massScale = t.massScale ?? 0.6;
    const a = this._makePiece(halfDef, i, p.x, p.y, angle, massScale);
    const b = this._makePiece(halfDef, i, spot.x, spot.y, angle + 0.4, massScale);
    for (const piece of [a, b]) piece.splitDone = true;
    a.confused = e.confused;
    b.isExtra = true;
    this.erasers[i] = a;
    this.extras.push(b);
    this._emit('split', { playerIndex: i, x: p.x, y: p.y, x2: spot.x, y2: spot.y });
  }

  _checkFalls() {
    let fell = false;
    for (const e of this._allPieces()) {
      if (!e.alive || e.airborne) continue; // ジャンプ中は 空中なので まだ落ちない
      const p = e.body.position;
      const bh = this.blackHole;
      const inHole = bh && Math.hypot(p.x - bh.x, p.y - bh.y) < bh.r;
      if (isInsideDesk(this.desk, p.x, p.y) && !inHole) continue;

      // クッション（カード）：弾いた消しゴムが ふちで1回 はね返る
      if (!inHole && this.turn.cushion && e.playerIndex === this.turnIndex && this.phase === 'moving') {
        const q = clampInside(this.desk, p.x, p.y, 3);
        let nx = p.x - q.x;
        let ny = p.y - q.y;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        const v = e.body.velocity;
        const dot = v.x * nx + v.y * ny;
        const b = this.turn.cushion;
        Body.setPosition(e.body, q);
        Body.setVelocity(e.body, { x: (v.x - 2 * dot * nx) * b, y: (v.y - 2 * dot * ny) * b });
        this.turn.cushion = 0;
        this._emit('cardFx', { type: 'cushion', playerIndex: e.playerIndex, x: q.x, y: q.y });
        continue;
      }
      // もういっかい（カード）：1回だけ まんなかに もどってくる
      if (e.extraLife && !e.isExtra && !this.extras.some((x) => x.alive && x.playerIndex === e.playerIndex)) {
        const spot = this._freeSpotNear(0, 0, e);
        if (spot) {
          e.extraLife = false;
          Body.setPosition(e.body, spot);
          Body.setVelocity(e.body, { x: 0, y: 0 });
          Body.setAngularVelocity(e.body, 0);
          this._emit('cardFx', { type: 'revive', playerIndex: e.playerIndex, x: spot.x, y: spot.y, fx: p.x, fy: p.y });
          continue;
        }
      }

      // ふみとどまり：ふちで止まる（しばらくは何度押されても止まる）
      if (!e.isExtra && (e.hold || this.time < e.holdUntil)) {
        const first = e.hold;
        e.hold = false;
        if (first) {
          const card = this.players[e.playerIndex].card?.def;
          e.holdUntil = this.time + (card?.params?.graceMs ?? 500);
        }
        Body.setPosition(e.body, clampInside(this.desk, p.x, p.y, 2));
        Body.setVelocity(e.body, { x: 0, y: 0 });
        Body.setAngularVelocity(e.body, 0);
        if (first) this._emit('hold', { playerIndex: e.playerIndex, x: e.body.position.x, y: e.body.position.y });
        continue;
      }

      e.alive = false;
      e.fall = {
        t: 0,
        x: p.x,
        y: p.y,
        angle: e.body.angle,
        vx: e.body.isStatic ? 0 : e.body.velocity.x,
        vy: e.body.isStatic ? 0 : e.body.velocity.y,
        av: e.body.isStatic ? 0 : e.body.angularVelocity,
      };
      Composite.remove(this.engine.world, e.body);
      fell = true;
      const i = e.playerIndex;

      if (e.isExtra) {
        // かけらが落ちた（まだメインが残っている）
        this.extras = this.extras.filter((x) => x !== e);
        this.debris.push(e);
        this._emit('pieceFall', { playerIndex: i, x: p.x, y: p.y });
        continue;
      }
      const spare = this.extras.find((x) => x.alive && x.playerIndex === i);
      if (spare) {
        // メインが落ちたけど、かけらが残っているのでセーフ
        this.extras = this.extras.filter((x) => x !== spare);
        spare.isExtra = false;
        this.debris.push(e);
        this.erasers[i] = spare;
        this._emit('pieceFall', { playerIndex: i, x: p.x, y: p.y });
        continue;
      }
      this.fallOrder.push(i);
      this._emit('fall', { playerIndex: i, x: p.x, y: p.y });
    }
    // 外れたパーツ・カバーが机から落ちた（勝ち負けには関係ない）
    for (const j of this.junk) {
      if (!j.alive) continue;
      const p = j.body.position;
      if (isInsideDesk(this.desk, p.x, p.y)) continue;
      j.alive = false;
      j.fall = { t: 0, x: p.x, y: p.y, angle: j.body.angle, vx: j.body.velocity.x, vy: j.body.velocity.y, av: j.body.angularVelocity };
      Composite.remove(this.engine.world, j.body);
    }
    return fell;
  }

  /** (x, y) の近くで、e を置ける あいている場所（机のまんなか・ブラックホールの外） */
  _freeSpotNear(x, y, e) {
    const ext = this.pieceExtent(e);
    const bh = this.blackHole;
    for (let r = 0; r < 260; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += r ? 0.5 : 7) {
        const q = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
        if (!isInsideDesk(this.desk, q.x, q.y) || edgeClearance(this.desk, q.x, q.y) < ext + 10) continue;
        if (bh && Math.hypot(q.x - bh.x, q.y - bh.y) < bh.r + ext + 10) continue;
        const busy = this._allPieces().some(
          (o) => o.alive && o !== e && Math.hypot(o.body.position.x - q.x, o.body.position.y - q.y) < ext + this.pieceExtent(o) + 6,
        );
        if (!busy) return q;
      }
    }
    return null;
  }

  _dropPencilsOutside() {
    for (const pc of this.pencils) {
      if (!pc.alive) continue;
      const { x, y } = pc.body.position;
      if (isInsideDesk(this.desk, x, y)) continue;
      pc.alive = false;
      pc.fall = { t: 0 };
      Composite.remove(this.engine.world, pc.body);
    }
    this.waxZones = this.waxZones.filter((z) => isInsideDesk(this.desk, z.x, z.y));
  }

  _updateFalls(dt) {
    const k = dt / BASE_DT;
    for (const e of [...this.erasers, ...this.debris, ...this.junk]) {
      const f = e.fall;
      if (!f || f.t > GAME.fallAnimMs * 2) continue;
      f.t += dt;
      f.x += f.vx * k;
      f.y += f.vy * k;
      f.angle += f.av * k;
      f.vx *= 0.92;
      f.vy *= 0.92;
    }
    this.debris = this.debris.filter((e) => e.fall.t <= GAME.fallAnimMs * 2);
    this.junk = this.junk.filter((j) => j.alive || j.fall.t <= GAME.fallAnimMs * 2);
    for (const pc of this.pencils) if (pc.fall && pc.fall.t <= GAME.fallAnimMs * 2) pc.fall.t += dt;
  }

  _zeroAll() {
    for (const e of this._allPieces()) {
      if (!e.alive || e.body.isStatic) continue;
      Body.setVelocity(e.body, { x: 0, y: 0 });
      Body.setAngularVelocity(e.body, 0);
    }
  }

  _checkOver() {
    const alive = this.erasers.filter((e) => e.alive);
    if (alive.length > 1) return false;
    this.phase = 'over';
    this.pendingShrink = null;
    const winner = alive.length ? alive[0].playerIndex : null; // null はひきわけ
    // 順位：勝った人 → あとから落ちた人ほど上
    const ranking = [...(winner != null ? [winner] : []), ...[...this.fallOrder].reverse()];
    this.result = { winner, ranking };
    this._emit('over', this.result);
    return true;
  }

  // 1回弾き終わったとき
  _finishShot() {
    this._zeroAll();
    this.turn.steer = null;
    if (this._checkOver()) return;
    const cur = this.erasers[this.turnIndex];
    if (cur.alive && this.turn.extraFlicks > 0) {
      // 連打：同じ人がもう1回
      this.turn.extraFlicks--;
      this.phase = 'aim';
      this._emit('again', { playerIndex: this.turnIndex });
      return;
    }
    this._endTurn();
  }

  // じしんなどでゆれたあと：同じ人が弾く
  _resume() {
    this._zeroAll();
    if (this._checkOver()) return;
    if (this.erasers[this.turnIndex].alive) {
      this.phase = 'aim';
      this._emit('resume', { playerIndex: this.turnIndex });
    } else {
      this._endTurn();
    }
  }

  _endTurn() {
    const cur = this.erasers[this.turnIndex];
    // おもり：自分のターンが終わったら動かなくなる
    if (cur.anchorPending) {
      cur.anchorPending = false;
      if (cur.alive) {
        Body.setStatic(cur.body, true);
        cur.anchored = true;
      }
    }
    // すべりどめ：自分のターンが終わったらすべりにくくなる
    if (cur.gripPending) {
      cur.gripPending = false;
      cur.grip = cur.gripScale || 3;
    }
    // クリアン：弾いたあとは見えにくくなる（つぎの自分の番まで）
    if (traitOf(cur).id === 'clear' && cur.alive && this.turn.flicked) {
      for (const pc of [cur, ...this.extrasOf(this.turnIndex)]) pc.clear = true;
    }
    // ユウレイケシ：番が終わったら すりぬけ おしまい（重なっていたら、はなれてから）
    for (const pc of this._allPieces()) if (pc.ghost) pc.ghostEnd = true;
    // サドンデス：予告していたところがけずれる
    if (this.pendingShrink) {
      this.desk.shape = this.pendingShrink;
      this.pendingShrink = null;
      this._emit('shrink', { shape: this.desk.shape });
      this._dropPencilsOutside();
      if (this._checkFalls()) {
        this.phase = 'shrinking'; // 落ちる演出が終わってから次へ
        return;
      }
    }
    if (this._checkOver()) return;
    this._advance();
  }

  _advance() {
    const n = this.erasers.length;
    let next = this.turnIndex;
    for (let guard = 0; guard < n * 3; guard++) {
      next = (next + 1) % n;
      if (!this.erasers[next].alive) continue;
      // ダイオウケシ：弾いたあとの番は「ためる」お休み
      const nm = this.erasers[next];
      if (traitOf(nm).id === 'charge' && !nm.charged) {
        nm.charged = true;
        this.turnCount++;
        this._emit('trait', { type: 'charge', playerIndex: next, x: nm.body.position.x, y: nm.body.position.y });
        continue;
      }
      if (this.players[next].skipNext) {
        this.players[next].skipNext = false;
        this.erasers[next].happy = false; // はなまるの うれしさ おしまい
        this.turnCount++;
        this._emit('skipped', { playerIndex: next });
        continue;
      }
      break;
    }
    this.turnIndex = next;
    this.turnCount++;
    this.turn = this._newTurn();
    this.phase = 'aim';
    // かたむき・ていでん・ブラックホールの おわり
    if (this.tilt && this.turnCount >= this.tilt.untilTurn) this.tilt = null;
    if (this.blackout && this.turnCount >= this.blackout.untilTurn) this.blackout = null;
    if (this.blackHole && this.turnCount >= this.blackHole.untilTurn) {
      this.blackHole = null;
      this._emit('cardFx', { type: 'holeClose', playerIndex: next, x: 0, y: 0 });
    }
    this._startTurnFor(next);

    const sd = { ...GAME.suddenDeath, ...this.desk.suddenDeath };
    if (this.turnCount >= sd.startTurn) {
      this.pendingShrink = shrinkShape(this.desk.shape, sd);
      if (this.pendingShrink) this._emit('shrinkWarn', { first: this.turnCount === sd.startTurn });
    }
    this._emit('turn', { turnIndex: next, turnCount: this.turnCount });
  }

  // 自分のターンが来たとき：カードの効果が切れる。とくせい（クリアン・パカッター）もここ
  _startTurnFor(i) {
    const e = this.erasers[i];
    if (!e.alive) return;
    if (e.anchored) {
      Body.setStatic(e.body, false);
      e.anchored = false;
      this._applyMass(e);
    }
    e.hold = false;
    e.holdUntil = 0;
    e.grip = 0;
    if (e.sizeLeft > 0) {
      e.sizeLeft--;
      if (e.sizeLeft === 0) this._setSize(e, null);
    }
    for (const pc of [e, ...this.extrasOf(i)]) pc.clear = false;
    if (traitOf(e).id === 'dice') this._rollDice(e); // サイコロン：番のたびに サイコロ
    // カードの効果：ふでばこは おしまい・とうめいは のこりを へらす・ためうちは パワー
    e.shield = false;
    if (e.invisLeft > 0) e.invisLeft--;
    if (e.powerNext) {
      this.turn.powerMul *= e.powerNext;
      e.powerNext = 0;
      this._emit('cardFx', { type: 'powerReady', playerIndex: i, x: e.body.position.x, y: e.body.position.y });
    }
    // まきもどし：ターンの はじめの場所を おぼえておく
    e.prevTurnPos = e.curTurnPos;
    e.curTurnPos = { x: e.body.position.x, y: e.body.position.y };
    this._trySplit(i);
  }

  // ---- オンライン：ゲームの状態をまるごと保存・復元 ----
  /** 番の区切りで、ゲームの状態を JSON にできる形で書き出す */
  exportState() {
    const pack = (e, extra) => ({
      pid: e.pid,
      pi: e.playerIndex,
      extra,
      defId: e.def.id,
      half: !!e.def.look.half,
      shape: e.def.look.half ? e.def.shape : null,
      x: e.alive ? e.body.position.x : 0,
      y: e.alive ? e.body.position.y : 0,
      angle: e.alive ? e.body.angle : 0,
      alive: e.alive,
      baseMass: e.baseMass,
      size: e.size,
      sizeLeft: e.sizeLeft,
      cardMass: e.cardMass,
      traitMass: e.traitMass,
      frictionMul: e.frictionMul,
      maxSpeed: e.maxSpeed,
      anchored: e.anchored,
      anchorPending: e.anchorPending,
      hold: e.hold,
      gripPending: e.gripPending,
      grip: e.grip,
      gripScale: e.gripScale || 0,
      covered: e.covered,
      parts: e.parts,
      gathered: e.gathered,
      confused: e.confused,
      clear: e.clear,
      splitDone: e.splitDone,
      dice: e.dice,
      defUsed: e.defUsed,
      ghost: e.ghost,
      ghostEnd: e.ghostEnd,
      blockUsed: e.blockUsed,
      charged: e.charged,
      cornerUsed: e.cornerUsed,
      hatched: e.hatched,
      stampUsed: e.stampUsed,
      happy: e.happy,
      powerNext: e.powerNext,
      invisLeft: e.invisLeft,
      shield: e.shield,
      extraLife: e.extraLife,
      reverseNext: e.reverseNext,
      curTurnPos: e.curTurnPos,
      prevTurnPos: e.prevTurnPos,
    });
    return {
      v: 1,
      deskShape: this.desk.shape,
      turnIndex: this.turnIndex,
      turnCount: this.turnCount,
      phase: this.phase,
      result: this.result,
      pendingShrink: this.pendingShrink,
      fallOrder: this.fallOrder,
      time: this.time,
      nextPid: this._nextPid,
      players: this.players.map((p) => ({
        cardId: p.card ? p.card.def.id : null,
        cardUsed: p.card ? p.card.used : false,
        queue: (p.cardQueue || []).map((c) => c.id),
        skipNext: p.skipNext,
      })),
      pieces: [
        ...this.erasers.map((e) => pack(e, false)),
        ...this.extras.filter((e) => e.alive).map((e) => pack(e, true)),
      ],
      pencils: this.pencils
        .filter((pc) => pc.alive)
        .map((pc) => ({
          x: pc.body.position.x,
          y: pc.body.position.y,
          angle: pc.body.angle,
          length: pc.length,
          width: pc.width,
          look: pc.look,
          color: pc.color,
        })),
      junk: this.junk.filter((j) => j.alive).map((j) => this._junkPack(j)),
      nextJid: this._nextJid,
      tilt: this.tilt,
      blackout: this.blackout,
      blackHole: this.blackHole,
      waxZones: this.waxZones,
    };
  }

  _junkPack(j) {
    return {
      jid: j.jid, kind: j.kind, w: j.w, h: j.h, color: j.color,
      x: j.body.position.x, y: j.body.position.y, angle: j.body.angle,
    };
  }

  /** exportState() で書き出した状態にする（ほかの人の番が終わったとき） */
  importState(st) {
    Composite.clear(this.engine.world, false);
    this.desk.shape = { ...st.deskShape };
    this.turnIndex = st.turnIndex;
    this.turnCount = st.turnCount;
    this.phase = st.phase === 'over' ? 'over' : 'aim';
    this.result = st.result || null;
    this.pendingShrink = st.pendingShrink || null;
    this.fallOrder = [...(st.fallOrder || [])];
    this.time = st.time || 0;
    this.turn = this._newTurn();
    this._stillFrames = 0;
    this._movingMs = 0;
    this.players.forEach((p, i) => {
      const sp = (st.players || [])[i] || {};
      const def = sp.cardId ? findCard(sp.cardId) : null;
      p.card = def ? { def, used: !!sp.cardUsed } : null;
      p.cardQueue = (sp.queue || []).map((id) => findCard(id)).filter(Boolean);
      p.skipNext = !!sp.skipNext;
    });

    const erasers = [];
    this.extras = [];
    this.debris = [];
    for (const pk of st.pieces || []) {
      let def = findEraser(pk.defId);
      if (pk.half) def = { ...def, shape: pk.shape, look: { ...def.look, half: true } };
      const e = this._makePiece(def, pk.pi, pk.x, pk.y, pk.angle);
      e.pid = pk.pid;
      Object.assign(e, {
        baseMass: pk.baseMass,
        cardMass: pk.cardMass,
        traitMass: pk.traitMass,
        frictionMul: pk.frictionMul,
        maxSpeed: pk.maxSpeed ?? e.maxSpeed,
        sizeLeft: pk.sizeLeft,
        anchorPending: pk.anchorPending,
        hold: pk.hold,
        gripPending: pk.gripPending,
        grip: pk.grip,
        gripScale: pk.gripScale,
        covered: pk.covered,
        parts: pk.parts,
        gathered: pk.gathered,
        confused: pk.confused,
        clear: pk.clear,
        splitDone: pk.splitDone,
        dice: pk.dice || 0,
        defUsed: !!pk.defUsed,
        ghost: !!pk.ghost,
        ghostEnd: !!pk.ghostEnd,
        blockUsed: !!pk.blockUsed,
        charged: pk.charged ?? true,
        cornerUsed: !!pk.cornerUsed,
        hatched: !!pk.hatched,
        stampUsed: !!pk.stampUsed,
        happy: !!pk.happy,
        powerNext: pk.powerNext || 0,
        invisLeft: pk.invisLeft || 0,
        shield: !!pk.shield,
        extraLife: !!pk.extraLife,
        reverseNext: !!pk.reverseNext,
        curTurnPos: pk.curTurnPos || { x: pk.x, y: pk.y },
        prevTurnPos: pk.prevTurnPos || null,
        isExtra: pk.extra,
      });
      if (e.dice) e.dicePower = traitOf(e).faces?.[e.dice - 1]?.power ?? 1;
      if (e.ghost) e.body.collisionFilter.mask = 0;
      if (pk.size && pk.size !== 1) {
        Body.scale(e.body, pk.size, pk.size);
        e.size = pk.size;
      }
      this._applyMass(e);
      if (pk.anchored) {
        Body.setStatic(e.body, true);
        e.anchored = true;
      }
      if (!pk.alive) {
        e.alive = false;
        e.fall = { t: GAME.fallAnimMs * 3, x: pk.x, y: pk.y, angle: pk.angle, vx: 0, vy: 0, av: 0 };
        Composite.remove(this.engine.world, e.body);
      }
      if (pk.extra) this.extras.push(e);
      else erasers[pk.pi] = e;
    }
    this.erasers = erasers;
    this._nextPid = st.nextPid || this._nextPid;

    this.pencils = [];
    for (const pc of st.pencils || []) this._addPencil(pc.x, pc.y, pc.angle, pc);
    this.tilt = st.tilt || null;
    this.blackout = st.blackout || null;
    this.blackHole = st.blackHole || null;
    this.junk = [];
    this._junkQueue = [];
    this._hatchQueue = [];
    for (const j of st.junk || []) this._addJunk(j);
    this._nextJid = st.nextJid || this._nextJid;
    this.waxZones = (st.waxZones || []).map((z) => ({ ...z }));
  }

  /** オンラインで通信が切れた人を脱落させる（いまの番ならつぎの人へ） */
  eliminate(i) {
    const main = this.erasers[i];
    if (!main.alive) return;
    for (const e of [main, ...this.extrasOf(i)]) {
      e.alive = false;
      e.fall = { t: 0, x: e.body.position.x, y: e.body.position.y, angle: e.body.angle, vx: 0, vy: 0, av: 0 };
      Composite.remove(this.engine.world, e.body);
    }
    this.extras = this.extras.filter((x) => x.playerIndex !== i);
    if (!this.fallOrder.includes(i)) this.fallOrder.push(i);
    this._emit('fall', { playerIndex: i, x: main.fall.x, y: main.fall.y, gone: true });
    if (this._checkOver()) return;
    if (this.turnIndex === i) {
      this._zeroAll();
      this._advance();
    }
  }

  // ---- 外から見るための情報 ----
  _pieceView(e) {
    const src = e.alive
      ? { x: e.body.position.x, y: e.body.position.y, angle: e.body.angle }
      : { x: e.fall.x, y: e.fall.y, angle: e.fall.angle };
    const t = traitOf(e);
    return {
      pid: e.pid,
      playerIndex: e.playerIndex,
      def: e.def,
      alive: e.alive,
      size: e.size,
      isExtra: e.isExtra,
      ...src,
      fallProgress: e.fall ? Math.min(1, e.fall.t / GAME.fallAnimMs) : 0,
      effects: {
        big: e.size > 1,
        mini: e.size < 1,
        anchor: e.anchored || e.anchorPending,
        hold: e.hold,
        grip: !!e.grip || e.gripPending,
        confused: e.confused,
        clear: e.clear,
        invisible: e.invisLeft > 0,
        shield: e.shield,
        extraLife: e.extraLife,
        reversed: e.reverseNext,
        airborne: e.airborne,
        power: e.powerNext > 0,
      },
      // とくせいの見た目（描画用）
      trait: {
        id: t.id,
        covered: e.covered,
        parts: e.parts,
        gathered: e.gathered,
        clear: e.clear,
        clearAlpha: t.alpha ?? 0.3,
        squish: Math.max(0, 1 - (this.time - e.squishAt) / 350),
        vibrating: t.id === 'vibrate',
        camo: !!t.camo,
        dice: e.dice,
        boosting: e.boostUntil > this.time,
        ghost: e.ghost,
        defUsed: e.defUsed,
        charging: t.id === 'charge' && !e.charged,
        glowing: t.id === 'glow' && !!this.desk.dark,
        toppled: e.toppleUntil > this.time,
        happy: e.happy,
      },
    };
  }

  getState() {
    return {
      desk: this.desk,
      phase: this.phase,
      turnIndex: this.turnIndex,
      turnCount: this.turnCount,
      players: this.players,
      result: this.result,
      pendingShrink: this.pendingShrink,
      waxZones: this.waxZones,
      curveActive: this.canSteer(this.turnIndex),
      glare: this.phase === 'aim' ? this.glareFor(this.turnIndex) : 0, // キラリンで 矢印がゆれる
      tilt: this.tilt,
      blackout: this.isBlackout(),
      blackHole: this.blackHole,
      time: this.time,
      pencils: this.pencils
        .filter((pc) => pc.alive || (pc.fall && pc.fall.t < GAME.fallAnimMs))
        .map((pc) => ({
          x: pc.body.position.x,
          y: pc.body.position.y,
          angle: pc.body.angle,
          length: pc.length,
          width: pc.width,
          look: pc.look,
          color: pc.color,
          alive: pc.alive,
          fallProgress: pc.fall ? Math.min(1, pc.fall.t / GAME.fallAnimMs) : 0,
        })),
      erasers: this.erasers.map((e) => this._pieceView(e)),
      extras: this.extras.filter((e) => e.alive).map((e) => this._pieceView(e)),
      debris: this.debris.map((e) => this._pieceView(e)),
      junk: this.junk.map((j) =>
        j.alive
          ? { ...this._junkPack(j), alive: true, fallProgress: 0 }
          : {
              jid: j.jid, kind: j.kind, w: j.w, h: j.h, color: j.color,
              x: j.fall.x, y: j.fall.y, angle: j.fall.angle,
              alive: false, fallProgress: Math.min(1, j.fall.t / GAME.fallAnimMs),
            },
      ),
    };
  }

  /** ていでん中か */
  isBlackout() {
    return !!this.blackout && this.turnCount >= this.blackout.fromTurn && this.turnCount < this.blackout.untilTurn;
  }

  /** CPU が計算に使う物理の値 */
  getEraserPhysics(i) {
    const e = this.erasers[i];
    const t = traitOf(e);
    // 机とのこすれ（_applyDeskBrake と同じ倍率。ワックス・こおりなどの 場所の分は のぞく）
    let local = (e.grip || 1) * e.frictionMul;
    if (t.id === 'brake') local *= t.scale ?? 1;
    if (t.slide && t.id !== 'crown' && t.id !== 'glow') local *= t.slide;
    const fa = e.baseFrictionAir * local;
    return {
      maxSpeed: e.maxSpeed * (i === this.turnIndex ? this.turn.powerMul : 1),
      frictionAir: fa,
      brake: local, // ブレーキの強さの倍率
      mass: e.body.isStatic ? Infinity : e.body.mass,
      extent: this.extentOf(i),
    };
  }

  distanceToEdge(x, y, ux, uy) {
    return distanceToEdge(this.desk, x, y, ux, uy);
  }

  edgeClearance(x, y) {
    return edgeClearance(this.desk, x, y);
  }
}
