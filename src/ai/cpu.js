// CPU の考え方（ふつう）
// 弾く：
// 1. 相手ごとに「自分→相手」の向きで押したら、机のふちまでどれくらいか を調べる
// 2. 一番落としやすそうな相手をねらう
// 3. 相手をふちの外まで押し出せそうな強さを計算する
// 4. 少しだけ、向きと強さをずらす
// カード：ターンの最初に「使うと得しそうなら」使う

import { PHYSICS } from '../config/physics.js';
import { nearestEdgeDir, eraserExtent } from '../logic/geometry.js';

const rand = (a) => (Math.random() * 2 - 1) * a;

// 速さ v で弾いたとき、maxDist 進むまで（または止まるまで）をコマ送りで計算する
function slide(v, fa, decel, maxDist) {
  let dist = 0;
  while (v > 0 && dist < maxDist) {
    v = Math.max(0, v - decel) * (1 - fa);
    dist += v;
  }
  return { dist, speed: v };
}

// ok(v) が成り立つ一番小さい v を二分探索で探す（上限 60）
function search(ok) {
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** 一番ねらいやすい相手（分かれたパカッターのかけらもねらう） */
export function pickTarget(game, me, from = null) {
  const st = game.getState();
  const my = from || st.erasers[me];
  let best = null;
  for (const t of [...st.erasers, ...st.extras]) {
    if (!t.alive || t.playerIndex === me) continue;
    const dx = t.x - my.x;
    const dy = t.y - my.y;
    const D = Math.hypot(dx, dy) || 1;
    const ux = dx / D;
    const uy = dy / D;
    const edge = game.distanceToEdge(t.x, t.y, ux, uy);
    // ふちに近くて、自分からも近い相手ほどねらい目。動かない相手（おもり）は後回し
    const score = edge + D * 0.25 + (t.effects.anchor ? 1000 : 0);
    if (!best || score < best.score) best = { t, ux, uy, D, edge, score };
  }
  return best;
}

export function planCpuShot(game, me, cfg) {
  const st = game.getState();
  const my = st.erasers[me];
  const myPhys = game.getEraserPhysics(me);
  const best = pickTarget(game, me);
  if (!best) return { dirX: 1, dirY: 0, strength: 0.3 };

  const tPhys = game.getEraserPhysics(best.t.playerIndex);
  const decel = PHYSICS.kineticDecel * game.desk.frictionScale;
  // 相手を (edge + pushMargin) すべらせるのに必要な、相手の初速
  const need = best.edge + cfg.pushMargin;
  const vTarget = search((v) => slide(v, tPhys.frictionAir, decel, Infinity).dist >= need);
  // ぶつかったときの勢いの受け渡し（重さとはね返りから計算）
  const vHit = (vTarget * (myPhys.mass + tPhys.mass)) / (myPhys.mass * (1 + PHYSICS.restitution));
  // ぶつかるまでに進む距離ぶん、減速を見こんで足す
  const gap = (myPhys.extent + eraserExtent(best.t.def) * best.t.size) * 0.6;
  const travel = Math.max(0, best.D - gap);
  const v0 = search((v) => slide(v, myPhys.frictionAir, decel, travel).speed >= vHit);

  let strength = v0 / myPhys.maxSpeed;
  strength *= 1 + rand(cfg.powerError);
  strength = Math.max(0.25, Math.min(1, strength));

  // クリアン（すけすけ）は見えにくいので、ねらいがズレる
  const blur = best.t.effects.clear ? best.t.def.trait?.aimErrorDeg ?? 14 : 0;
  const ang = Math.atan2(best.uy, best.ux) + (rand(cfg.angleErrorDeg + blur) * Math.PI) / 180;
  const dirX = Math.cos(ang);
  const dirY = Math.sin(ang);
  const spin = rand(cfg.spin ?? 0);
  return { dirX, dirY, strength, spin, target: best.t.playerIndex };
}

/** パカッターが分かれているとき、どっちのかけらで弾くか決める（えらんだほうがメインになる） */
export function chooseCpuPiece(game, me) {
  const extras = game.extrasOf(me);
  if (!extras.length) return;
  let bestPiece = null;
  let bestScore = Infinity;
  for (const piece of [game.erasers[me], ...extras]) {
    const from = { x: piece.body.position.x, y: piece.body.position.y };
    const t = pickTarget(game, me, from);
    if (t && t.score < bestScore) {
      bestScore = t.score;
      bestPiece = piece;
    }
  }
  if (bestPiece && bestPiece !== game.erasers[me]) game.selectPiece(me, bestPiece);
}

/**
 * このターンにカードを使うか決める。使わないなら null、使うなら useCard に渡す params
 */
export function planCpuCard(game, me, cfg) {
  if (!game.canUseCard(me)) return null;
  const def = game.players[me].card.def;
  const st = game.getState();
  const my = st.erasers[me];
  const best = pickTarget(game, me);
  if (!best) return null;
  const opp = best.t;
  const myEdge = game.edgeClearance(my.x, my.y);
  const oppEdge = game.edgeClearance(opp.x, opp.y);
  const chance = () => Math.random() < cfg.cardChance;
  const ok = (params) => (game.validatePlacement(def.place, params, me, def).ok ? params : null);

  switch (def.id) {
    case 'hold':
    case 'anchor':
    case 'grip':
      // 自分がふちに近いときに守る
      return myEdge < 110 ? {} : null;
    case 'okawari':
      return {}; // いつ使っても得
    case 'fan': {
      // 近くに、ふちぎわの相手がいるときに ふきとばす
      const range = def.params?.range ?? 380;
      const hit = st.erasers.some(
        (t) => t.alive && t.playerIndex !== me &&
          Math.hypot(t.x - my.x, t.y - my.y) < range * 0.7 && game.edgeClearance(t.x, t.y) < 130,
      );
      return hit ? {} : null;
    }
    case 'swap': {
      // 自分のほうがふちに近いときだけ入れかえる（クロケシのガードには使えない）
      const ok2 = game.opponentsOf(me, 'swap').includes(opp.playerIndex);
      return ok2 && myEdge < oppEdge - 40 ? { target: opp.playerIndex } : null;
    }
    case 'skip': {
      const opps = game.opponentsOf(me, 'skip');
      if (!opps.length) return null;
      return chance() ? { target: opps.includes(opp.playerIndex) ? opp.playerIndex : opps[0] } : null;
    }
    case 'barrier':
    case 'ruler': {
      if (myEdge > 140 && !chance()) return null;
      // 自分の「一番近いふち」側にえんぴつを置いて落ちにくくする
      const d = nearestEdgeDir(game.desk, my.x, my.y);
      const off = game.extentOf(me) + (def.params?.width ?? 14) / 2 + 15;
      return ok({ x: my.x + d.x * off, y: my.y + d.y * off, angle: Math.atan2(d.y, d.x) + Math.PI / 2 });
    }
    case 'wax':
      // 相手の足もとをつるつるに
      return chance() ? ok({ x: opp.x, y: opp.y }) : null;
    case 'teleport': {
      // 相手の「ふちと反対側」にワープして、ふちに向かって押し出す
      const d = nearestEdgeDir(game.desk, opp.x, opp.y);
      for (const back of [70, 50, 95, 120]) {
        const dist = game.extentOf(me) + game.extentOf(opp.playerIndex) + back;
        const p = ok({ x: opp.x - d.x * dist, y: opp.y - d.y * dist });
        if (p) return p;
      }
      return null;
    }
    case 'curve':
    case 'rapid':
    case 'big':
    case 'quake':
    case 'hazure':
    default:
      return chance() ? {} : null;
  }
}
