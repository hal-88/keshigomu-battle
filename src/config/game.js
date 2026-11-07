// ゲーム全体の数値・操作・CPU の設定

export const GAME = {
  // プレイヤーの色（1人目, 2人目, 3人目, 4人目）
  playerColors: ['#ff6b4a', '#3b82f6', '#22a35a', '#a855f7'],
  // 1台でみんなで遊ぶときの、はじめの名前（色とおそろい）
  playerNames: ['あか', 'あお', 'みどり', 'むらさき'],
  nameMaxLength: 6,
  minPlayers: 2,
  maxPlayers: 4,

  fallAnimMs: 700, // 落ちるとき小さくなる演出の長さ
  resultDelayMs: 1400, // 勝負がついてから結果画面までの待ち時間

  // サドンデス：このターンから、毎ターン机のふちがけずれる（そのターンの間は点滅で予告）
  suddenDeath: {
    startTurn: 10,
    shrinkPerTurn: 24, // 1回でけずれる幅（片側）
    minRect: 150, // 長方形の机はこれより小さくならない（たて・よこ）
    minRadius: 90, // 丸い机はこれより小さくならない（半径）
  },

  // 図鑑とガチャ（お金は使わない。チケットは遊んでもらうだけ）
  collection: {
    ticketChance: 0.2, // CPU にかったとき、ガチャチケットがもらえる確率
    pityWins: 10, // この回数かつまでにもらえなかったら、かならず1枚
    cpuPickLockedChance: 0.6, // CPU が「まだ持っていない消しゴム」を選ぶ確率（出会えるように）
  },

  // 大きい机（autoCamera: true）で、消しゴムのいるあたりにカメラを寄せる
  autoCamera: {
    maxZoom: 1.9, // いちばん寄ったときの倍率
    margin: 260, // 消しゴムのまわりに見せる広さ
    follow: 0.06, // カメラが追いかける速さ（0〜1）
  },

  // 落ちる瞬間のスロー＆ズーム
  slowmo: {
    timeScale: 0.25, // 時間の進み方（0.25 = 4倍スロー）
    durationMs: 1300, // 演出の長さ（ふつうの時間で）
    zoom: 1.8,
  },

  input: {
    maxPullPx: 150, // これだけ引っぱると最大パワー（画面上のピクセル）
    minPullPx: 12, // これより短いと「やっぱりやめた」扱い
    touchSlopPx: 26, // 消しゴムのまわりをこれだけ外しても、つかめる
  },

  cpu: {
    normal: {
      angleErrorDeg: 4, // ねらいのずれ（±度）
      powerError: 0.1, // 強さのずれ（±割合）
      pushMargin: 40, // 相手を机のふちからどれだけ余分に押し出すつもりで弾くか
      thinkMs: 700, // 考えている時間
      aimShowMs: 700, // 引っぱる様子を見せる時間
      cardChance: 0.45, // とくに理由がないカードを、そのターンに使う確率
      confuseNotice: 0.85, // フルーツンで向きが反対になっているのに気づく確率
      spin: 0.5, // 弾くときにかける回転（-この値〜+この値でランダム）
    },
  },
};
