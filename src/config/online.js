// オンライン対戦の設定

// Firebase の設定。Firebase コンソールの「プロジェクトの設定 → マイアプリ」に出る firebaseConfig を
// ここに貼る。null のあいだは「テストモード」（同じパソコンの別のタブどうしだけで対戦できる）。
// ※ この値はパスワードではなく、公開して使うもの。安全は database.rules.json のルールで守る。
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB3Z-2PAPhBdwPVcXxgE8PRH5gI-9TmM-U',
  authDomain: 'keshigomu-battle.firebaseapp.com',
  databaseURL: 'https://keshigomu-battle-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'keshigomu-battle',
  storageBucket: 'keshigomu-battle.firebasestorage.app',
  messagingSenderId: '491293764169',
  appId: '1:491293764169:web:67506df0a97c98d53ead98',
};

export const ONLINE = {
  minPlayers: 2,
  maxPlayers: 4,
  codeDigits: 4, // あいことば（部屋の番号）のけた数
  nameMaxLength: 6,
  frameMs: 100, // 弾いた人が動きを送る間かく（ミリ秒）
  disconnectSec: 15, // 自分の番で、通信が切れたままこの秒数たつと脱落
  idleTurnSec: 90, // 自分の番で、なにもしないままこの秒数たつと脱落
  roomExpireHours: 6, // これより古い部屋は、同じあいことばで作りなおせる
  stampCooldownMs: 1500, // スタンプを続けて送れない時間
  // 送れるスタンプ（チャットのかわり。決まったことばだけ）
  stamps: [
    { id: 'nice', text: 'ナイス！', icon: '👍' },
    { id: 'yarareta', text: 'やられた〜', icon: '😵' },
    { id: 'ganbare', text: 'がんばれ！', icon: '📣' },
    { id: 'sugoi', text: 'すごい！', icon: '✨' },
    { id: 'donmai', text: 'ドンマイ', icon: '🤝' },
    { id: 'arigato', text: 'ありがとう', icon: '😊' },
  ],
};
