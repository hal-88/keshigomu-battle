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
  tournamentMaxPlayers: 16, // トーナメントの部屋に 入れる人数
  tourAbsentSec: 30, // トーナメントで、試合の人が この秒数 いなかったら 負け
  codeDigits: 4, // あいことば（部屋の番号）のけた数
  nameMaxLength: 6,
  frameMs: 100, // 弾いた人が動きを送る間かく（ミリ秒）
  disconnectSec: 15, // 自分の番で、通信が切れたままこの秒数たつと脱落
  idleTurnSec: 90, // 自分の番で、なにもしないままこの秒数たつと脱落
  roomExpireHours: 6, // これより古い部屋は、同じあいことばで作りなおせる
  randomWaitSec: 60, // ランダムマッチで 相手を 待つ 時間（これを すぎたら「今は 相手が いないよ」）
  randomJoinWaitSec: 12, // 相手が「組む」と 書いてから 部屋に 入ってくるまで 待つ 時間
  randomScanMs: 2000, // 待っている 間に 待合リストを 見なおす 間かく
  randomStartMs: 3000, // 相手が 見つかってから 対戦が はじまるまで
  // ランダムマッチの レート（src/progress/rating.js）
  rating: {
    start: 1000,
    min: 100, // これより 下がらない
    kNew: 40, // はじめの 10試合は 大きく 動く
    newGames: 10,
    k: 24,
    // 段位（min 以上で その段位）
    tiers: [
      { id: 'bronze', name: 'ブロンズ', icon: '🥉', color: '#b8733d', min: 0 },
      { id: 'silver', name: 'シルバー', icon: '🥈', color: '#8d99a6', min: 1100 },
      { id: 'gold', name: 'ゴールド', icon: '🥇', color: '#e0a400', min: 1250 },
      { id: 'diamond', name: 'ダイヤ', icon: '💎', color: '#2fa6d8', min: 1400 },
      { id: 'master', name: 'マスター', icon: '👑', color: '#9b4dd6', min: 1600 },
    ],
  },
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
