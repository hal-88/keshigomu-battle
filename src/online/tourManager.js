// オンライン・トーナメントの まとめ役。
// ・部屋の meta・members・tour だけを 見る（ほかの試合の動きは 見ない）
// ・部屋の「リーダー」（いま つながっている人のうち、いちばん先に入った人）の端末が、
//   CPU どうしの試合を 計算したり、いなくなった人を 負けにしたりする
// どの画面にいても（自分が試合中でも）動きつづける。

import { sortedMembers } from './room.js';
import { readyMatches, champion } from '../tournament/bracket.js';
import { runAutoMatch } from '../tournament/autoMatch.js';
import { ONLINE } from '../config/online.js';

const toArray = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);

/** Firebase から来た表を、ふつうの配列の形に なおす（null の場所が 消えてくるため） */
export function normalizeTour(t) {
  if (!t) return null;
  const rounds = toArray(t.rounds).map((list) =>
    toArray(list).map((m) => ({ a: m?.a ?? null, b: m?.b ?? null, winner: m?.winner ?? null, deskId: m?.deskId })),
  );
  return { ...t, entries: toArray(t.entries), rounds };
}

export class TourManager {
  constructor(session) {
    this.session = session;
    this.tour = null;
    this.meta = null;
    this.members = {};
    this.listeners = new Set();
    this.goneSince = new Map(); // uid → いなくなった時間
    this.busy = new Set(); // 計算中の試合
    this.stops = [];
    this.iv = 0;
  }

  start() {
    const s = this.session;
    this.stops.push(
      s.watchPart('meta', (v) => {
        this.meta = v;
        this.emit();
      }),
      s.watchPart('members', (v) => {
        this.members = v || {};
        this.trackGone();
        this.emit();
      }),
      s.watchPart('tour', (v) => {
        this.tour = normalizeTour(v);
        this.emit();
      }),
    );
    this.iv = setInterval(() => this.tick(), 1000);
    return this;
  }

  stop() {
    clearInterval(this.iv);
    this.stops.forEach((f) => f && f());
    this.stops = [];
    this.listeners.clear();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  isHere(uid) {
    const m = this.members[uid];
    return !!m && !m.left && m.online !== false;
  }

  trackGone() {
    const now = Date.now();
    for (const [uid] of Object.entries(this.members)) {
      if (this.isHere(uid)) this.goneSince.delete(uid);
      else if (!this.goneSince.has(uid)) this.goneSince.set(uid, this.members[uid].left ? 0 : now); // 出ていった人は すぐ
    }
  }

  goneFor(uid) {
    if (this.isHere(uid)) return 0;
    const t = this.goneSince.get(uid);
    return t == null ? Infinity : Date.now() - t;
  }

  /** いま つながっている人のうち、いちばん先に入った人（まとめ役） */
  leaderUid() {
    return sortedMembers({ members: this.members }).find((m) => m.online !== false)?.uid;
  }

  isLeader() {
    return this.leaderUid() === this.session.uid;
  }

  /** 自分の entry の番号（いなければ -1） */
  myIndex() {
    return this.tour ? this.tour.entries.findIndex((e) => e.uid === this.session.uid) : -1;
  }

  /** 人どうしの試合で、さいしょの状態を作る人（つながっている方。両方なら a の人） */
  creatorUid(match) {
    const ua = this.tour.entries[match.a]?.uid;
    const ub = this.tour.entries[match.b]?.uid;
    if (this.isHere(ua)) return ua;
    if (this.isHere(ub)) return ub;
    return ua;
  }

  /** 結果を書く（まだ決まっていないときだけ） */
  report(r, m, winner) {
    const t = this.tour;
    if (!t || t.rounds[r]?.[m]?.winner != null) return Promise.resolve();
    t.rounds[r][m].winner = winner; // すぐ反映（2回書かないように）
    const last = r === t.rounds.length - 1;
    return last ? this.session.reportFinal(r, m, winner) : this.session.reportWinner(r, m, winner);
  }

  // まとめ役の しごと
  tick() {
    const t = this.tour;
    if (!t || this.meta?.status !== 'tournament' || champion(t) != null || !this.isLeader()) return;
    const absentMs = ONLINE.tourAbsentSec * 1000;
    for (const { r, m, match } of readyMatches(t)) {
      const key = `${r}-${m}`;
      if (this.busy.has(key)) continue;
      const ea = t.entries[match.a];
      const eb = t.entries[match.b];
      const aCpu = ea.type === 'cpu';
      const bCpu = eb.type === 'cpu';
      if (aCpu && bCpu) {
        // CPU どうし：まとめて 計算（1試合ずつ すこし間をあけて、表が じゅんばんに うまっていくように）
        this.busy.add(key);
        setTimeout(() => {
          const w = runAutoMatch(match.deskId, ea.eraserId, eb.eraserId);
          this.report(r, m, w === 0 ? match.a : match.b).finally(() => this.busy.delete(key));
        }, 400 + Math.random() * 1200);
        continue;
      }
      // 人がいる試合：人が ずっと いなければ 負け
      const aGone = !aCpu && this.goneFor(ea.uid) > absentMs;
      const bGone = !bCpu && this.goneFor(eb.uid) > absentMs;
      let w = null;
      if (aCpu && bGone) w = match.a;
      else if (bCpu && aGone) w = match.b;
      else if (!aCpu && !bCpu && aGone && bGone) w = match.a; // 2人とも いない（どちらかを すすめる）
      else if (!aCpu && !bCpu && aGone && !bGone && this.goneFor(ea.uid) > absentMs * 2) w = match.b; // 相手が来ないまま
      else if (!aCpu && !bCpu && bGone && !aGone && this.goneFor(eb.uid) > absentMs * 2) w = match.a;
      if (w != null) {
        this.busy.add(key);
        this.report(r, m, w).finally(() => this.busy.delete(key));
      }
    }
  }
}
