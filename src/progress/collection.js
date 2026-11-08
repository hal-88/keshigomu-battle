// 図鑑のデータ（持っている消しゴム・見たもの・ガチャチケット）。
// この端末のブラウザの中だけに保存する（1台に1つ）。保存できない環境でもゲームは動く。

import { ERASERS, START_ERASER_IDS, GACHA_ERASERS, REGULAR_ERASERS, CHAMPION_ERASERS, findEraser, pickByRarity } from '../config/erasers.js';
import { GAME } from '../config/game.js';

const KEY = 'keshigomu-collection-v1';

const fresh = () => ({
  owned: [...START_ERASER_IDS], // 使える消しゴム・文房具
  seen: [...START_ERASER_IDS], // 見たことがある（図鑑にシルエットが出る）
  cardsSeen: [], // 見たことがあるカード
  tickets: 0,
  matchesSinceTicket: 0, // 天井（5戦でかならず1枚）までのカウント
  matches: 0,
  wins: 0,
  pulls: 0,
  bestStreak: 0, // CPU 連勝チャレンジのベスト記録
  trophies: [], // トーナメントで優勝した記録 [{ date, size, cup, name, usedEraserId, eraserId }]
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
  /** あと何回たたかうと、チケットがかならずもらえるか */
  matchesToPity: () => Math.max(1, GAME.collection.pityMatches - (data.matchesSinceTicket || 0)),
  /**
   * いまガチャから出るもの（まだ持っていないものだけ）。
   * まずはガチャ限定（文房具・とくべつ消しゴム）。ぜんぶ集めたら、ふつうの消しゴム（CPU戦で手に入るもの）が出る
   */
  gachaPool() {
    const limited = GACHA_ERASERS.filter((e) => !data.owned.includes(e.id));
    if (limited.length) return { kind: 'gacha', items: limited, total: GACHA_ERASERS.length };
    return { kind: 'eraser', items: REGULAR_ERASERS.filter((e) => !data.owned.includes(e.id)), total: REGULAR_ERASERS.length };
  },
  gachaLeft: () => collection.gachaPool().items.length,
  /** チケットは いつでも もらえて、いくらでも ためておける（新しい消しゴムが出たときに引けるように） */
  canGetTicket: () => true,

  markSeen(ids) {
    if (addUnique(data.seen, ids)) save();
  },
  markCardsSeen(ids) {
    if (addUnique(data.cardsSeen, ids)) save();
  },

  /**
   * 試合が終わったときに呼ぶ（CPU戦・オンライン）。
   * ・CPU にかったら、たおした相手の消しゴムが手に入り、20%でチケット
   * ・勝っても負けても5戦ごとに、かならずチケット（天井）
   * ・れんしょうチャレンジで3連勝ごとに、ボーナスでチケット
   * @param won         かったか
   * @param cpuWin      CPU にかったか（消しゴムと 20% のチケットはこのときだけ）
   * @param defeatedIds たおした CPU の消しゴムの id
   * @param streak      いまの連勝数（れんしょうチャレンジのとき）
   * @returns {{ unlocked: object[], ticket: boolean, bonus: boolean }}
   */
  finishMatch({ won = false, cpuWin = false, defeatedIds = [], streak = 0 } = {}) {
    const c = GAME.collection;
    data.matches = (data.matches || 0) + 1;
    if (won) data.wins++;
    const unlocked = [];
    if (cpuWin) {
      for (const id of defeatedIds) {
        const def = findEraser(id);
        if (def && !def.gacha && !data.owned.includes(id)) {
          data.owned.push(id);
          unlocked.push(def);
        }
      }
      addUnique(data.seen, defeatedIds);
    }

    // チケット（ぜんぶ集めたあとも もらえる。ためておける）
    let ticket = false;
    if (collection.canGetTicket()) {
      data.matchesSinceTicket = (data.matchesSinceTicket || 0) + 1;
      if ((cpuWin && Math.random() < c.ticketChance) || data.matchesSinceTicket >= c.pityMatches) {
        data.tickets++;
        data.matchesSinceTicket = 0;
        ticket = true;
      }
    }
    let bonus = false;
    if (streak > 0 && streak % c.streakBonusEvery === 0 && collection.canGetTicket()) {
      data.tickets++;
      bonus = true;
    }
    save();
    return { unlocked, ticket, bonus };
  },

  /**
   * ガチャを1回まわす。持っていないものだけが出る（ダブりなし。レアほど出にくい）。
   * ガチャ限定をぜんぶ集めたら、ふつうの消しゴムが出る。引けないときは null（チケットは へらない）
   */
  pullGacha() {
    const pool = collection.gachaPool().items;
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

  /**
   * トーナメントで優勝したとき：優勝限定の消しゴムを ランダムで1つ（まだ持っていないもの）
   * @returns {{ eraser: object|null, wins: number }} eraser は もらえた消しゴム（ぜんぶ持っていたら null）
   */
  winTournament({ size = 8, cup = 'CPU杯', name = 'あなた', usedEraserId = null } = {}) {
    const left = CHAMPION_ERASERS.filter((e) => !data.owned.includes(e.id));
    const eraser = left.length ? left[Math.floor(Math.random() * left.length)] : null;
    if (eraser) {
      data.owned.push(eraser.id);
      addUnique(data.seen, [eraser.id]);
    }
    const d = new Date();
    const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    // 優勝した記録（消しゴムに 刻まれる：大会名・名前・日付）
    data.trophies = [...(data.trophies || []), { date, size, cup, name, usedEraserId, eraserId: eraser?.id || null }];
    save();
    return { eraser, wins: data.trophies.length };
  },
  /**
   * 消しゴムに 刻まれた 記録（新しいものから）
   * kind: 'win'（その消しゴムで 優勝）/ 'reward'（優勝の ごほうびで もらった）
   */
  engravings(eraserId) {
    return (data.trophies || [])
      .flatMap((t) => [
        ...(t.usedEraserId === eraserId ? [{ ...t, kind: 'win' }] : []),
        ...(t.eraserId === eraserId ? [{ ...t, kind: 'reward' }] : []),
      ])
      .reverse();
  },
  /** トーナメントで優勝した回数 */
  tournamentWins: () => (data.trophies || []).length,

  /** データをぜんぶ消して、はじめからにする */
  reset() {
    data = fresh();
    save();
  },
};
