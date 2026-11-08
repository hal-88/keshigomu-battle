// トーナメント表（どの人と どの人が戦うか、だれが勝ちあがったか）。画面のことは知らない。
//
// entries … 出る人（8人 か 16人）。{ name, type: 'human'|'cpu'|'remote', eraserId, uid? }
// rounds  … 回戦ごとの試合。rounds[r][m] = { a, b, winner, deskId }（a, b は entries の番号）
//            1回戦は となりどうし（0と1、2と3…）。つぎの回戦は 前の2試合の勝った人どうし

import { DESKS } from '../config/desks.js';

/** 人数に合わせた トーナメントの大きさ（8人まで → 8人、9〜16人 → 16人） */
export const bracketSize = (humans) => (humans <= 8 ? 8 : 16);

/** 回戦の名前 */
export function roundName(size, r) {
  const total = Math.log2(size);
  const left = total - r; // のこりの回戦の数
  if (left === 1) return '決勝';
  if (left === 2) return '準決勝';
  return `${r + 1}回戦`;
}

/**
 * 人を「ちらばる」ように置く 場所の順番。この順に 人を入れていくと、人どうしが
 * なるべく あとの回戦まで 当たらない（8人なら 0,4,2,6,1,5,3,7）
 */
export function spreadOrder(size) {
  const rec = (lo, hi) => {
    if (hi - lo === 1) return [lo];
    const mid = (lo + hi) / 2;
    const a = rec(lo, mid);
    const b = rec(mid, hi);
    const out = [];
    for (let i = 0; i < a.length; i++) out.push(a[i], b[i]);
    return out;
  };
  return rec(0, size);
}

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const randomDesk = () => DESKS[Math.floor(Math.random() * DESKS.length)].id;

/**
 * トーナメント表を つくる。組み合わせは ランダム。でも 人は なるべく ちらばる（1回戦で 人どうしが 当たりにくい）
 * @param humans 人のリスト
 * @param makeCpu (k) => CPU の entry（足りない分）
 */
export function makeBracket(humans, makeCpu, size = bracketSize(humans.length)) {
  const order = spreadOrder(size);
  // ランダムに：ブロックの左右を ひっくり返す（ちらばりかたは そのまま）
  const flip = Math.floor(Math.random() * size);
  const spots = order.map((p) => p ^ flip);
  const entries = new Array(size).fill(null);
  shuffle(humans).forEach((h, k) => {
    entries[spots[k]] = h;
  });
  let c = 0;
  for (let i = 0; i < size; i++) if (!entries[i]) entries[i] = makeCpu(c++);
  const rounds = [];
  let n = size / 2;
  for (let r = 0; n >= 1; r++, n /= 2) {
    rounds.push(
      Array.from({ length: n }, (_, m) => ({
        a: r === 0 ? m * 2 : null,
        b: r === 0 ? m * 2 + 1 : null,
        winner: null,
        deskId: randomDesk(), // 机は 毎回 ランダム
      })),
    );
  }
  return { size, entries, rounds };
}

/** 試合の結果を書く。勝った人を つぎの回戦へ */
export function setWinner(br, r, m, winner) {
  const match = br.rounds[r][m];
  match.winner = winner;
  const next = br.rounds[r + 1]?.[Math.floor(m / 2)];
  if (next) {
    if (m % 2 === 0) next.a = winner;
    else next.b = winner;
  }
}

/** まだ終わっていなくて、2人ともそろっている試合（{ r, m, match }） */
export function readyMatches(br) {
  const out = [];
  br.rounds.forEach((list, r) =>
    list.forEach((match, m) => {
      if (match.winner == null && match.a != null && match.b != null) out.push({ r, m, match });
    }),
  );
  return out;
}

/** entry の番号の人が いま出る試合（なければ null） */
export function matchOf(br, idx) {
  return readyMatches(br).find(({ match }) => match.a === idx || match.b === idx) || null;
}

/** 負けて おわったか */
export function isOut(br, idx) {
  return br.rounds.some((list) => list.some((m) => m.winner != null && (m.a === idx || m.b === idx) && m.winner !== idx));
}

/** 優勝した人の番号（まだなら null） */
export const champion = (br) => br.rounds[br.rounds.length - 1][0].winner;
