// 図鑑のデータ（持っている消しゴム・見たもの・ガチャチケット）。
// この端末のブラウザの中だけに保存する（1台に1つ）。保存できない環境でもゲームは動く。

import { ERASERS, START_ERASER_IDS, GACHA_ERASERS, REGULAR_ERASERS, CHAMPION_ERASERS, MUKASHI_ERASERS, findEraser, pickByRarity } from '../config/erasers.js';
import { GAME } from '../config/game.js';

const KEY = 'keshigomu-collection-v1';

/** お正月（昔あそびガチャの 期間）か。URL に ?newyear が あれば いつでも（ためす用） */
export function isMukashiSeason(date = new Date()) {
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('newyear')) return true;
  } catch {
    /* 無視 */
  }
  const { from, to } = GAME.collection.mukashi;
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const a = from[0] * 100 + from[1];
  const b = to[0] * 100 + to[1];
  return a <= b ? md >= a && md <= b : md >= a || md <= b; // 年を またぐ
}
/** 昔あそびガチャが 終わる日（画面に 出す） */
export const mukashiUntil = () => `${GAME.collection.mukashi.to[0]}/${GAME.collection.mukashi.to[1]}`;
const isMukashi = (e) => e.kind === 'mukashi';
/** あそびシリーズ（世界の遊び・昔あそび）は「あそびガチャ」から 出る */
const isAsobi = (e) => e.kind === 'sekai' || e.kind === 'mukashi';
/** ガチャの 種類（スワイプで えらぶ）。お正月は 昔あそびガチャも */
export const gachaModes = () => (isMukashiSeason() ? ['mukashi', 'normal', 'asobi'] : ['normal', 'asobi']);

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
  kira: [], // ガチャで 2回出た「キラ」（見た目だけ キラキラ）
  shards: 0, // ガチャで 3回目からの ダブりで たまる かけら
  pullsSinceNew: 0, // 持っていないものが 出なかった 回数（ガチャの 新しいもの保証）
  favorites: [], // お気に入りの消しゴム（3つまで。選ぶ画面で いちばん上に出る）
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
  /** 持っている消しゴム（お気に入りが 先。お気に入りどうしは 登録した順） */
  ownedErasers: () => {
    const fav = (data.favorites || []).filter((id) => data.owned.includes(id));
    const owned = ERASERS.filter((e) => data.owned.includes(e.id));
    return [...fav.map((id) => owned.find((e) => e.id === id)), ...owned.filter((e) => !fav.includes(e.id))];
  },
  isFavorite: (id) => (data.favorites || []).includes(id),
  favorites: () => [...(data.favorites || [])],
  /**
   * お気に入りに 入れる／はずす（3つまで）
   * @returns {{ ok: boolean, on: boolean, reason?: string }}
   */
  toggleFavorite(id) {
    const fav = data.favorites || [];
    if (fav.includes(id)) {
      data.favorites = fav.filter((x) => x !== id);
      save();
      return { ok: true, on: false };
    }
    if (fav.length >= GAME.collection.maxFavorites) {
      return { ok: false, on: false, reason: `お気に入りは ${GAME.collection.maxFavorites}つまで。どれかを はずしてね` };
    }
    data.favorites = [...fav, id];
    save();
    return { ok: true, on: true };
  },
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
  /**
   * ガチャの中身。ガチャ限定（文房具・特別）は ダブっても出る。
   * ガチャ限定を ぜんぶ集めたら、まだ持っていない ふつうの消しゴムも まざる
   * fresh … まだ持っていないもの（新しいもの保証で 出る）
   */
  gachaPool(mode = 'normal') {
    const own = (e) => data.owned.includes(e.id);
    if (mode === 'mukashi') {
      // 🎍昔あそびガチャ：昔あそびシリーズだけ
      const fresh = MUKASHI_ERASERS.filter((e) => !own(e));
      return { kind: 'mukashi', items: [...MUKASHI_ERASERS], fresh, total: MUKASHI_ERASERS.length, owned: MUKASHI_ERASERS.filter(own).length };
    }
    if (mode === 'asobi') {
      // 🌏あそびガチャ：世界の遊び・昔あそび（昔あそびは ふだん まれ）
      const list = GACHA_ERASERS.filter(isAsobi);
      const fresh = list.filter((e) => !own(e));
      return { kind: fresh.length ? 'asobi' : 'done', items: list, fresh, total: list.length, owned: list.filter(own).length };
    }
    // 🎰特別ガチャ：文房具・特別・給食。ぜんぶ 集めたら まだ 持っていない ふつうの 消しゴムも まざる
    const limited = GACHA_ERASERS.filter((e) => !isAsobi(e));
    const newLimited = limited.filter((e) => !own(e));
    const newRegular = newLimited.length ? [] : REGULAR_ERASERS.filter((e) => !own(e));
    return {
      kind: newLimited.length ? 'gacha' : newRegular.length ? 'eraser' : 'done',
      items: [...limited, ...newRegular],
      fresh: [...newLimited, ...newRegular],
      total: limited.length,
      owned: limited.filter(own).length,
    };
  },
  isKira: (id) => (data.kira || []).includes(id),
  shards: () => data.shards || 0,
  /** あと何回で 新しいものが かくてい（持っていないものが もうないときは null） */
  pullsToNew(mode = 'normal') {
    if (!collection.gachaPool(mode).fresh.length) return null;
    return Math.max(1, GAME.collection.gachaNewEvery - (data.pullsSinceNew || 0));
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
  /**
   * ガチャを 1回 引く
   * @returns {{ def, kind: 'new'|'kira'|'shard', shards: number, ticketBack: boolean, forced: boolean } | null}
   *   new … はじめて／kira … 2回目（キラに なった）／shard … 3回目から（かけら +1。5こで チケット1枚）
   */
  pullGacha(mode = 'normal') {
    const c = GAME.collection;
    const pool = collection.gachaPool(mode);
    if (data.tickets < 1 || !pool.items.length) return null;
    // ダブりが つづいたら、かならず 持っていないものを
    const forced = pool.fresh.length > 0 && (data.pullsSinceNew || 0) >= c.gachaNewEvery - 1;
    let list = forced ? pool.fresh : pool.items;
    if (mode !== 'mukashi') {
      // 昔あそびシリーズは ふだんの ガチャでは まれに（お正月は 昔あそびガチャで）
      const muk = list.filter(isMukashi);
      const rest = list.filter((e) => !isMukashi(e));
      if (muk.length && rest.length) list = Math.random() < c.mukashi.offChance ? muk : rest;
    }
    const def = pickByRarity(list);
    data.tickets--;
    data.pulls++;
    let kind;
    let ticketBack = false;
    if (!data.owned.includes(def.id)) {
      kind = 'new';
      data.owned.push(def.id);
      addUnique(data.seen, [def.id]);
      data.pullsSinceNew = 0;
    } else {
      data.pullsSinceNew = (data.pullsSinceNew || 0) + 1;
      data.kira = data.kira || [];
      if (!data.kira.includes(def.id)) {
        kind = 'kira';
        data.kira.push(def.id);
      } else {
        kind = 'shard';
        data.shards = (data.shards || 0) + 1;
        if (data.shards >= c.shardsPerTicket) {
          data.shards -= c.shardsPerTicket;
          data.tickets++;
          ticketBack = true;
        }
      }
    }
    save();
    return { def, kind, shards: data.shards || 0, ticketBack, forced };
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
