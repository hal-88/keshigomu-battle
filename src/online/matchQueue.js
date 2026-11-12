// ランダムマッチ：知らない人と 1対1。今の 部屋（rooms/4けた）の しくみは そのままで、待合リスト（queue）を 足しただけ。
//
// queue/uid … { code, at, claim }
//   code  … 待っている人が 先に 作った 部屋の 合言葉
//   at    … 待ちはじめた 時間
//   claim … 「この人と 組む」と 決めた人の uid。早い者勝ち（db.claim）で 1人だけ 書ける
//
// 流れ：
//  1. 待っている人が いれば（古い順）、claim を 書いて その部屋に 入る（joinRoom）。
//  2. いなければ 自分が 部屋を 作って queue に 書いて 待つ。待っている 間も 2秒ごとに 見なおす
//     （ほぼ 同時に 押した 2人が 両方 待ってしまわないように。自分より 古い 人だけ とりに いく）。
//  3. 自分に claim が ついたら、相手が 部屋に 入ってくるのを 待つ（来なければ claim を 消して また 待つ）。
//  4. 60秒で だれも いなければ「今は 相手が いないよ」。
//  ※ 名前・消しゴムは 部屋の members に 書く（queue には 書かない）。

import { DESKS } from '../config/desks.js';
import { ONLINE } from '../config/online.js';
import { getDb, createRoom, joinRoom, sortedMembers } from './room.js';

const Q = 'queue';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param opts { name, eraserId, wins, onTick(残り秒), onMatched({ code, host }), onTimeout(), onError(err) }
 * @returns { cancel() }
 */
export function startRandomMatch(opts) {
  let stopped = false;
  let mine = null; // 自分が 待っている 部屋 { code, at }
  let db = null;

  async function withdraw() {
    if (!mine || !db) return;
    const m = mine;
    mine = null;
    await db.remove(`${Q}/${db.uid}`).catch(() => {});
    await db.update(`rooms/${m.code}/members/${db.uid}`, { online: false, left: true }).catch(() => {});
  }

  /** 待っている 人を 1人 とる（とれたら { code, uid }） */
  async function claimOther() {
    const q = (await db.get(Q)) || {};
    const now = db.now();
    const limit = (ONLINE.randomWaitSec + 5) * 1000;
    const cands = Object.entries(q)
      .filter(([uid, v]) => uid !== db.uid && v?.code && !v.claim && now - (v.at || 0) < limit)
      // 自分も 待っているなら、自分より 先に 待っていた人だけ（おたがいに とりあわないように）
      .filter(([uid, v]) => !mine || v.at < mine.at || (v.at === mine.at && uid < db.uid))
      .sort((a, b) => a[1].at - b[1].at);
    for (const [uid, v] of cands) {
      if (stopped) return null;
      // 自分も 待っているなら、先に 自分の 札を ふさぐ（その間に だれかが 自分を とらないように）
      if (mine && !(await db.claim(`${Q}/${db.uid}/claim`, db.uid))) return null;
      if (await db.claim(`${Q}/${uid}/claim`, db.uid)) return { code: v.code, uid };
      if (mine) await db.set(`${Q}/${db.uid}/claim`, null);
    }
    return null;
  }

  /** cond() が true になるまで 待つ（ms まで） */
  async function waitFor(cond, ms) {
    const end = Date.now() + ms;
    while (!stopped && Date.now() < end) {
      if (await cond()) return true;
      await sleep(500);
    }
    return false;
  }

  async function run() {
    db = await getDb();
    const deadline = Date.now() + ONLINE.randomWaitSec * 1000;
    while (!stopped) {
      // 1) 自分が 待っていて、だれかが 組みに 来た？
      if (mine) {
        const me = await db.get(`${Q}/${db.uid}`);
        if (me?.claim && me.claim !== db.uid) {
          const code = mine.code;
          const ok = await waitFor(async () => sortedMembers(await db.get(`rooms/${code}`)).length >= 2, ONLINE.randomJoinWaitSec * 1000);
          if (stopped) return;
          if (ok) {
            mine = null;
            await db.remove(`${Q}/${db.uid}`).catch(() => {});
            opts.onMatched({ code, host: true });
            return;
          }
          await db.set(`${Q}/${db.uid}/claim`, null); // 来なかった：また 待つ
        } else if (!me) {
          mine = null; // 待合リストから 消えていた（通信が 切れた など）：作りなおす
        }
      }
      const left = deadline - Date.now();
      if (left <= 0) {
        await withdraw();
        if (!stopped) opts.onTimeout();
        return;
      }
      opts.onTick?.(Math.ceil(left / 1000));

      // 2) 待っている 人を さがす
      const found = await claimOther();
      if (stopped) return;
      if (found) {
        try {
          await joinRoom(found.code, { name: opts.name, eraserId: opts.eraserId, wins: opts.wins });
          await withdraw(); // 自分の 部屋は もう いらない
          if (!stopped) opts.onMatched({ code: found.code, host: false });
          return;
        } catch {
          if (mine) await db.set(`${Q}/${db.uid}/claim`, null).catch(() => {}); // 入れなかった：つづける
        }
      }

      // 3) だれも いなければ、自分が 部屋を 作って 待つ
      if (!mine) {
        const deskId = DESKS[Math.floor(Math.random() * DESKS.length)].id;
        const code = await createRoom({ name: opts.name, eraserId: opts.eraserId, deskId, random: true, wins: opts.wins });
        if (stopped) {
          await db.update(`rooms/${code}/members/${db.uid}`, { online: false, left: true }).catch(() => {});
          return;
        }
        const at = db.now();
        await db.set(`${Q}/${db.uid}`, { code, at });
        db.onDisconnectSet(`${Q}/${db.uid}`, null); // 画面を 閉じたら 待合リストから 消える
        mine = { code, at };
      }
      await sleep(ONLINE.randomScanMs);
    }
  }

  run().catch(async (err) => {
    await withdraw();
    if (!stopped) opts.onError?.(err);
  });

  return {
    async cancel() {
      stopped = true;
      await withdraw();
    },
  };
}
