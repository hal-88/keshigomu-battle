// Firebase Realtime Database の通信。localDb.js と同じ形で使える。
// Firebase のプログラムは大きいので、オンラインを使うときだけ読みこむ。

export async function createFirebaseDb(config) {
  const [{ initializeApp }, dbMod, authMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/database'),
    import('firebase/auth'),
  ]);
  const { getDatabase, ref, get, set, update, push, remove, onValue, onChildAdded, onDisconnect, serverTimestamp } = dbMod;
  const { getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserSessionPersistence } = authMod;

  const app = initializeApp(config);
  const db = getDatabase(app);
  const auth = getAuth(app);
  // テスト用：URL に ?sep をつけると、タブごとに べつの人になる（同じパソコンで2人分ためすため）
  if (new URLSearchParams(location.search).has('sep')) await setPersistence(auth, browserSessionPersistence);

  // 名前もメールもいらない「匿名ログイン」。データベースのルールで「ログインした人だけ」にするため
  const uid = await new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) {
        stop();
        resolve(user.uid);
      }
    });
    signInAnonymously(auth).catch(reject);
  });

  // サーバーとの時計のずれ
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
    offset = snap.val() || 0;
  });

  const disconnectRefs = [];
  // Firebase は「undefined（からっぽ）」の値を受けつけないので、送る前に取りのぞく
  const clean = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

  return {
    kind: 'firebase',
    uid,
    async ready() {
      return uid;
    },
    async get(path) {
      const snap = await get(ref(db, path));
      return snap.exists() ? snap.val() : null;
    },
    set: (path, value) => set(ref(db, path), clean(value)),
    update: (path, obj) => update(ref(db, path), clean(obj)),
    async push(path, value) {
      const r = push(ref(db, path));
      await set(r, clean(value));
      return r.key;
    },
    remove: (path) => remove(ref(db, path)),
    listen(path, cb) {
      return onValue(ref(db, path), (snap) => cb(snap.exists() ? snap.val() : null));
    },
    listenChildAdded(path, cb) {
      return onChildAdded(ref(db, path), (snap) => cb(snap.key, snap.val()));
    },
    onDisconnectSet(path, value) {
      const od = onDisconnect(ref(db, path));
      od.set(value);
      disconnectRefs.push(od);
    },
    cancelOnDisconnect() {
      for (const od of disconnectRefs) od.cancel();
      disconnectRefs.length = 0;
    },
    serverTimestamp,
    now: () => Date.now() + offset,
  };
}
