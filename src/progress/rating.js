// ランダムマッチの レート（強さの 数字）と 段位。この端末だけに 保存する（ほかの人には ランキングを 見せない）。
//
// ・はじめは 1000。勝つと 上がり、負けると 下がる（イロレーティング。強い 相手に 勝つほど 多く 上がる）。
// ・対戦が はじまった ときに「負け」として 先に 計算しておく（とちゅうで やめても 負けに なる）。
//   結果が 出たら、本当の 結果で 計算しなおす。
// ・数値は config/online.js の ONLINE.rating。

import { ONLINE } from '../config/online.js';

const KEY = 'keshigomu-rating-v1';
const R = ONLINE.rating;

const fresh = () => ({ rating: R.start, games: 0, wins: 0, pending: null });

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d.rating === 'number') return { ...fresh(), ...d };
  } catch {
    /* 読めなければ はじめから */
  }
  return fresh();
}
let data = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 保存できなくても 遊べる */
  }
}

/** 段位 { id, name, icon, color, min, next（次の 段位の 数字。いちばん上は null） } */
export function tierOf(rating) {
  const ts = R.tiers;
  let i = 0;
  while (i + 1 < ts.length && rating >= ts[i + 1].min) i++;
  return { ...ts[i], next: ts[i + 1]?.min ?? null };
}

/** 「🥉 ブロンズ 1000」 */
export const ratingLabel = (r) => {
  const t = tierOf(r);
  return `${t.icon} ${t.name} ${Math.round(r)}`;
};

/** 勝ち（1）・引き分け（0.5）・負け（0）の あとの レート */
function elo(me, opp, score, games) {
  const expect = 1 / (1 + 10 ** ((opp - me) / 400));
  const k = games < R.newGames ? R.kNew : R.k;
  return Math.max(R.min, Math.round(me + k * (score - expect)));
}

export const rating = {
  get: () => data.rating,
  games: () => data.games,
  /**
   * 対戦が はじまった：先に「負け」で 計算しておく（とちゅうで やめても 負け）
   * @param gid 試合の 番号（同じ 試合を 2回 数えない）
   */
  begin(gid, oppRating) {
    if (data.pending?.gid === gid) return;
    const before = data.rating;
    const opp = typeof oppRating === 'number' ? oppRating : R.start;
    data.pending = { gid, before, opp };
    data.rating = elo(before, opp, 0, data.games);
    data.games++;
    save();
  },
  /**
   * 結果が 出た：本当の 結果で 計算しなおす
   * @param score 1 勝ち / 0.5 引き分け / 0 負け
   * @returns { before, after, delta, up（段位が 上がった）, down } または null（この 試合は 数えていない）
   */
  finish(gid, score) {
    const p = data.pending;
    if (!p || p.gid !== gid) return null;
    data.rating = elo(p.before, p.opp, score, data.games - 1);
    if (score === 1) data.wins++;
    data.pending = null;
    save();
    const a = tierOf(p.before);
    const b = tierOf(data.rating);
    return {
      before: p.before,
      after: data.rating,
      delta: data.rating - p.before,
      up: b.min > a.min,
      down: b.min < a.min,
    };
  },
};
