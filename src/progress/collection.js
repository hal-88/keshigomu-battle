// 図鑑のデータ（持っている消しゴム・見たもの・ガチャチケット）。
// この端末のブラウザの中だけに保存する（1台に1つ）。保存できない環境でもゲームは動く。

import { ERASERS, START_ERASER_IDS, GACHA_ERASERS, findEraser, pickByRarity } from '../config/erasers.js';
import { GAME } from '../config/game.js';

const KEY = 'keshigomu-collection-v1';

const fresh = () => ({
  owned: [...START_ERASER_IDS], // 使える消しゴム・文房具
  seen: [...START_ERASER_IDS], // 見たことがある（図鑑にシルエットが出る）
  cardsSeen: [], // 見たことがあるカード
  tickets: 0,
  winsSinceTicket: 0, // 天井までのカウント
  wins: 0,
  pulls: 0,
  bestStreak: 0, // CPU 連勝チャレンジのベスト記録
});

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.owned)) {
      const f = fresh();
      return {
        ...f,
        ...d,
        owned: [...new Set([...f.owned, ...d.owned])],
        seen: [...new Set([...f.seen, ...(d.seen || [])])],
      };
    }
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
    /* 保存できなくても遊べる */
  }
}

const addUnique = (list, ids) => {
  let added = false;
  for (const id of ids) {
    if (!list.includes(id)) {
      list.push(id);
      added = true;
    }
  }
  return added;
};

export const collection = {
  owns: (id) => data.owned.includes(id),
  ownedErasers: () => ERASERS.filter((e) => data.owned.includes(e.id)),
  hasSeen: (id) => data.seen.includes(id),
  hasSeenCard: (id) => data.cardsSeen.includes(id),
  tickets: () => data.tickets,
  wins: () => data.wins,
  /** あと何回かつと、チケットがかならずもらえるか */
  winsToPity: () => Math.max(1, GAME.collection.pityWins - data.winsSinceTicket),
  gachaLeft: () => GACHA_ERASERS.filter((e) => !data.owned.includes(e.id)).length,

  markSeen(ids) {
    if (addUnique(data.seen, ids)) save();
  },
  markCardsSeen(ids) {
    if (addUnique(data.cardsSeen, ids)) save();
  },

  /**
   * CPU にかったときに呼ぶ。たおした相手の消しゴムが手に入り、チケットがもらえることがある。
   * @param defeatedIds たおした CPU の消しゴムの id
   * @returns {{ unlocked: object[], ticket: boolean }}
   */
  recordCpuWin(defeatedIds) {
    data.wins++;
    const unlocked = [];
    for (const id of defeatedIds) {
      const def = findEraser(id);
      if (def && !def.gacha && !data.owned.includes(id)) {
        data.owned.push(id);
        unlocked.push(def);
      }
    }
    addUnique(data.seen, defeatedIds);

    let ticket = false;
    if (collection.gachaLeft() > data.tickets) {
      // まだ引けるガチャが残っているときだけ、チケットをくばる
      data.winsSinceTicket++;
      const c = GAME.collection;
      if (Math.random() < c.ticketChance || data.winsSinceTicket >= c.pityWins) {
        data.tickets++;
        data.winsSinceTicket = 0;
        ticket = true;
      }
    }
    save();
    return { unlocked, ticket };
  },

  /** ガチャを1回まわす。持っていない文房具だけが出る（ダブりなし。レアほど出にくい）。引けないときは null */
  pullGacha() {
    const pool = GACHA_ERASERS.filter((e) => !data.owned.includes(e.id));
    if (data.tickets < 1 || !pool.length) return null;
    const def = pickByRarity(pool);
    data.tickets--;
    data.pulls++;
    data.owned.push(def.id);
    addUnique(data.seen, [def.id]);
    save();
    return def;
  },

  bestStreak: () => data.bestStreak || 0,
  /** 連勝の記録をつける。ベストを更新したら true */
  recordStreak(n) {
    if (n <= (data.bestStreak || 0)) return false;
    data.bestStreak = n;
    save();
    return true;
  },

  /** データをぜんぶ消して、はじめからにする */
  reset() {
    data = fresh();
    save();
  },
};
