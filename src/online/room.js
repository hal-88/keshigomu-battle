// オンラインの部屋（へや）。あいことば（数字）を知っている人だけが入れる。
//
// データの形（rooms/あいことば）
//   meta    … { createdAt, host, status: 'lobby' | 'playing', deskId }
//   members … { uid: { name, eraserId, joinedAt, online, left } }
//   game    … { seq, order: [uid...], state }   ← 番が終わるたびに、弾いた人が書く
//   stream  … 弾いている間の動き（{ seq, k, view, ev }）。番ごとに消す
//   stamps  … スタンプ（{ uid, id, at }）

import { FIREBASE_CONFIG, ONLINE } from '../config/online.js';

let dbPromise = null;

/** 通信をはじめる（Firebase の設定がなければテストモード） */
export function getDb() {
  if (!dbPromise) {
    dbPromise = FIREBASE_CONFIG
      ? import('./firebaseDb.js').then((m) => m.createFirebaseDb(FIREBASE_CONFIG))
      : import('./localDb.js').then((m) => m.createLocalDb());
    dbPromise.catch(() => {
      dbPromise = null; // しっぱいしたら、つぎにもう一度ためす
    });
  }
  return dbPromise;
}

export const isTestMode = () => !FIREBASE_CONFIG;

const P = (code, sub = '') => `rooms/${code}${sub ? '/' + sub : ''}`;

const cleanName = (name) => String(name || '').trim().slice(0, ONLINE.nameMaxLength) || '名前';

function randomCode() {
  const min = 10 ** (ONLINE.codeDigits - 1);
  return String(min + Math.floor(Math.random() * (9 * min)));
}

/** 部屋の参加者を、入った順にならべる */
export function sortedMembers(room) {
  return Object.entries(room?.members || {})
    .map(([uid, m]) => ({ uid, ...m }))
    .filter((m) => !m.left)
    .sort((a, b) => a.joinedAt - b.joinedAt || (a.uid < b.uid ? -1 : 1));
}

/** 部屋をつくる。あいことばを返す */
export async function createRoom({ name, eraserId, deskId }) {
  const db = await getDb();
  for (let tries = 0; tries < 30; tries++) {
    const code = randomCode();
    const meta = await db.get(P(code, 'meta'));
    if (meta && db.now() - meta.createdAt < ONLINE.roomExpireHours * 3600e3) continue; // 使われている
    await db.set(P(code), {
      meta: { createdAt: db.now(), host: db.uid, status: 'lobby', deskId },
      members: { [db.uid]: { name: cleanName(name), eraserId, joinedAt: db.now(), online: true } },
    });
    return code;
  }
  throw new Error('今は 部屋を作れないよ。少し待ってね');
}

/** あいことばで部屋に入る */
export async function joinRoom(code, { name, eraserId }) {
  const db = await getDb();
  code = String(code).trim();
  const room = await db.get(P(code));
  if (!room || !room.meta) throw new Error('その合言葉の 部屋は ないよ');
  if (db.now() - room.meta.createdAt > ONLINE.roomExpireHours * 3600e3) throw new Error('その部屋は もう 終わっているよ');
  const already = room.members?.[db.uid] && !room.members[db.uid].left;
  if (room.meta.status !== 'lobby' && !already) throw new Error('その部屋は もう 対戦中だよ');
  if (!already && sortedMembers(room).length >= ONLINE.maxPlayers) throw new Error('その部屋は 満員だよ');
  await db.set(P(code, `members/${db.uid}`), {
    name: cleanName(name),
    eraserId,
    joinedAt: already ? room.members[db.uid].joinedAt : db.now(),
    online: true,
  });
  return code;
}

/** 部屋の中でのやりとり */
export class RoomSession {
  constructor(db, code) {
    this.db = db;
    this.code = code;
    this.uid = db.uid;
    this.stops = [];
  }

  static async open(code) {
    const db = await getDb();
    const s = new RoomSession(db, code);
    s.keepPresence();
    return s;
  }

  // 通信が切れたら online: false になるようにしておく
  keepPresence() {
    const path = P(this.code, `members/${this.uid}/online`);
    this.db.set(path, true);
    this.db.onDisconnectSet(path, false);
  }

  watchRoom(cb) {
    const stop = this.db.listen(P(this.code), cb);
    this.stops.push(stop);
    return stop;
  }

  updateMe(fields) {
    return this.db.update(P(this.code, `members/${this.uid}`), fields);
  }

  setDesk(deskId) {
    return this.db.update(P(this.code, 'meta'), { deskId });
  }

  /** ホストがスタート：ならび順・最初の状態を書く */
  async start(order, state) {
    await this.db.remove(P(this.code, 'stream'));
    const gid = Math.random().toString(36).slice(2, 10); // この試合の番号（前の試合とまちがえないため）
    await this.db.set(P(this.code, 'game'), { gid, seq: 1, order, state, at: this.db.now() });
    await this.db.update(P(this.code, 'meta'), { status: 'playing' });
  }

  /** 番が終わったときの状態を書く */
  async writeState(seq, state) {
    await this.db.update(P(this.code, 'game'), { seq, state, at: this.db.now() });
  }

  watchGame(cb) {
    const stop = this.db.listen(P(this.code, 'game'), cb);
    this.stops.push(stop);
    return stop;
  }

  pushFrame(frame) {
    return this.db.push(P(this.code, 'stream'), frame);
  }

  clearStream() {
    return this.db.remove(P(this.code, 'stream'));
  }

  watchFrames(cb) {
    const stop = this.db.listenChildAdded(P(this.code, 'stream'), (key, value) => cb(value));
    this.stops.push(stop);
    return stop;
  }

  sendStamp(id) {
    return this.db.push(P(this.code, 'stamps'), { uid: this.uid, id, at: this.db.now() });
  }

  watchStamps(cb) {
    const since = this.db.now() - 2000;
    const stop = this.db.listenChildAdded(P(this.code, 'stamps'), (key, v) => {
      if (v && v.at >= since) cb(v);
    });
    this.stops.push(stop);
    return stop;
  }

  /** ホスト：もう一回（待合室にもどる） */
  async backToLobby() {
    await this.db.remove(P(this.code, 'game'));
    await this.db.remove(P(this.code, 'stream'));
    await this.db.remove(P(this.code, 'stamps'));
    await this.db.update(P(this.code, 'meta'), { status: 'lobby' });
  }

  /** 部屋を出る */
  async leave() {
    this.stopAll();
    this.db.cancelOnDisconnect();
    await this.db.update(P(this.code, `members/${this.uid}`), { online: false, left: true });
  }

  stopAll() {
    this.stops.forEach((s) => s && s());
    this.stops = [];
  }
}
