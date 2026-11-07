// 消しゴムの設定。ここに1項目追加すれば、新しい消しゴムが増える。
//
// shape（形・当たり判定）
//   rect    … 長方形。w×h、chamfer は角の丸み
//   polygon … 正多角形。sides 角形、radius は中心から角までの長さ
//   circle  … 円。radius
// look（見た目）… body は本体の色、sleeve は紙ケースの色、sleeveText はケースの文字
//                  art があると、その名前の絵（render/stationeryArt.js・render/eraserArt.js）で描く
// stats（ステータス）… パワー・バランス・スピード（各1〜5、合計9）
// trait（とくせい）… その消しゴムだけの能力。id で種類、name と desc は画面に出す説明、
//                    ほかの数字は強さ（しくみは logic/Game.js の「とくせい」のところ）
// rarity … normal / rare / superrare / ultra（SSR）/ legend（UR）。強さは変わらない。
//          レアほど CPU が使うことが少なく、ガチャでも出にくい（ERASER_RARITY の weight）
// kind … 'chara' はキャラ消しゴム、'special' はガチャ限定の「とくべつ消しゴム」（図鑑で分けて表示）
// gacha … true ならガチャでしか手に入らない（文房具・とくべつ消しゴム）。
//         それ以外は、はじめから持っている（START_ERASER_IDS）か、CPUにかつと手に入る

// 消しゴムのレア度。weight は出やすさ（CPU が選ぶとき・ガチャ）
export const ERASER_RARITY = {
  normal: { label: 'ノーマル', weight: 3 },
  rare: { label: 'レア', weight: 1.2 },
  superrare: { label: 'スーパーレア', weight: 0.4 },
  ultra: { label: 'ウルトラレア', weight: 0.15 }, // SSR
  legend: { label: 'レジェンド', weight: 0.06 }, // UR
};

/** レア度の重みで1つえらぶ */
export function pickByRarity(list) {
  const w = (e) => ERASER_RARITY[e.rarity || 'normal'].weight;
  const total = list.reduce((sum, e) => sum + w(e), 0);
  let r = Math.random() * total;
  for (const e of list) {
    r -= w(e);
    if (r < 0) return e;
  }
  return list[list.length - 1];
}

export const STAT_LABELS = {
  power: 'パワー',
  balance: 'バランス',
  speed: 'スピード',
};

export const ERASERS = [
  // ---- ふつうの消しゴム ----
  {
    id: 'white-standard', rarity: 'normal',
    name: 'シロカク',
    desc: 'ふつうの白い角消し。バランス型で、はじめての人に',
    shape: { type: 'rect', w: 64, h: 32, chamfer: 4 },
    look: { body: '#f8f8f3', sleeve: '#3d8be0', sleeveText: 'けしごむ' },
    stats: { power: 3, balance: 3, speed: 3 },
  },
  {
    id: 'jumbo', rarity: 'normal',
    name: 'ドッシリン',
    desc: '大きくて重いジャンボ消しゴム。弾きにくいけど落ちにくい',
    shape: { type: 'rect', w: 80, h: 42, chamfer: 5 },
    look: { body: '#fbfbf5', sleeve: '#2fae63', sleeveText: 'ドッシリ' },
    stats: { power: 3, balance: 5, speed: 1 },
  },
  {
    id: 'chibikeshi', rarity: 'normal',
    name: 'チビケシ',
    desc: '使い切る寸前の小さいやつ。当たりにくいけど飛ばされやすい',
    shape: { type: 'rect', w: 34, h: 22, chamfer: 9 },
    look: { body: '#efece2', smudge: true },
    stats: { power: 3, balance: 2, speed: 4 },
  },
  {
    id: 'hosokeshi', rarity: 'normal',
    name: 'スティッカー',
    desc: 'ペン型・ノック式。細長くて、角度で戦うタイプ',
    shape: { type: 'rect', w: 86, h: 18, chamfer: 6 },
    look: { art: 'knock', body: '#7e57c2' },
    stats: { power: 5, balance: 1, speed: 3 },
    trait: { id: 'spinny', name: 'くるくる', desc: '回転がかかりやすく、長く回る', spinScale: 1.7, damping: 0.3 },
  },
  {
    id: 'sunakeshi', rarity: 'normal',
    name: 'ザラボン',
    desc: 'ざらざらの砂消し。すべらずピタッと止まる',
    shape: { type: 'rect', w: 66, h: 30, chamfer: 3 },
    look: { body: '#8d99a8', speckle: '#5d6876', sleeve: '#d9534f', sleeveText: 'ザラ', sleeveRatio: 0.45 },
    stats: { power: 4, balance: 4, speed: 1 },
    trait: { id: 'brake', name: 'ピタッ', desc: 'ブレーキが強く、すぐ止まる', scale: 1.2 },
  },
  {
    id: 'nerikeshi', rarity: 'rare',
    name: 'グニャット',
    desc: 'ぐにゃぐにゃのねりけし。ぶつかると変形して衝撃を吸収',
    shape: { type: 'circle', radius: 24 },
    look: { body: '#98a3b3', blob: true },
    stats: { power: 1, balance: 4, speed: 4 },
    trait: { id: 'absorb', name: 'ぐにゃっ', desc: '当てられると、勢いを少しすいこむ', keep: 0.7 },
  },
  {
    id: 'kadodarake', rarity: 'rare',
    name: 'カクカクン',
    desc: '角がたくさんある多面体。机の端で粘る',
    shape: { type: 'polygon', sides: 7, radius: 31 },
    look: { body: '#fff1b8', facet: '#f2d77a' },
    stats: { power: 4, balance: 3, speed: 2 },
    trait: { id: 'edgeGrip', name: 'ふんばり', desc: 'ふちの近くでは、角が引っかかって止まりやすい', range: 45, scale: 3.5 },
  },
  {
    id: 'matomaru', rarity: 'rare',
    name: 'マトマール',
    desc: 'カスがまとまるタイプ。当てるたびに少しずつ重くなる',
    shape: { type: 'rect', w: 60, h: 30, chamfer: 6 },
    look: { body: '#dff0ff', sleeve: '#4aa3df', sleeveText: 'まとまる', crumbs: true },
    stats: { power: 2, balance: 3, speed: 4 },
    trait: { id: 'gather', name: 'まとまる', desc: 'ぶつかるたびに重くなる（最大1.6倍）', perHit: 0.1, max: 1.6 },
  },
  {
    id: 'clear', rarity: 'superrare',
    name: 'クリアン',
    desc: 'すきとおった透明消しゴム',
    shape: { type: 'rect', w: 58, h: 30, chamfer: 6 },
    look: { art: 'clear', body: '#bfe6ff' },
    stats: { power: 3, balance: 2, speed: 4 },
    trait: { id: 'clear', name: 'すけすけ', desc: '弾いて止まると、つぎの自分の番まで 完全に見えなくなる（CPUのねらいもズレる）', aimErrorDeg: 22, alpha: 0 },
  },
  {
    id: 'kurokeshi', rarity: 'rare',
    name: 'クロケシ',
    desc: '黒くてしぶい消しゴム。よごれも作戦も気にしない',
    shape: { type: 'rect', w: 62, h: 30, chamfer: 4 },
    look: { body: '#2b2b30', sleeve: '#e6e6e6', sleeveText: 'クロ', sleeveTextColor: '#2b2b30' },
    stats: { power: 3, balance: 4, speed: 2 },
    trait: { id: 'guard', name: 'ガード', desc: '相手のカードの効果をうけない（スキップ・いれかえ・せんぷうき・じしん・ぐるぐる・ワックス）' },
  },
  {
    id: 'koromaru', rarity: 'normal',
    name: 'ころまる',
    desc: 'まんまるのボール型。よく転がる',
    shape: { type: 'circle', radius: 21 },
    look: { art: 'ball', body: '#ffd7e6' },
    stats: { power: 3, balance: 2, speed: 4 },
    trait: { id: 'brake', name: 'ころころ', desc: '止まりにくい。遠くまで転がる', scale: 0.9 },
  },
  {
    id: 'fruit', rarity: 'rare',
    name: 'フルーツン',
    desc: 'いちごのにおいつき消しゴム',
    shape: { type: 'rect', w: 52, h: 32, chamfer: 10 },
    look: { art: 'fruit', body: '#ffd1dc' },
    stats: { power: 2, balance: 3, speed: 4 },
    trait: {
      id: 'confuse', name: 'あまいかおり',
      desc: '当たった相手は こんらんする。つぎに弾くとき、5回に1回くらい 反対の向きに 弱く飛んでしまう',
      backChance: 0.2, backPower: 0.3, // 反対に飛ぶ確率と、そのときの強さ
    },
  },
  {
    id: 'pakatter', rarity: 'superrare',
    name: 'パカッター',
    desc: '半分に割れたやつ。ピンチになると2つに分かれる',
    shape: { type: 'rect', w: 60, h: 30, chamfer: 4 },
    look: { art: 'pakatter', body: '#f6f6f0', sleeve: '#ff9f43' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: {
      id: 'split', name: 'ぶんれつ',
      desc: 'ふちの近くで自分の番が来ると、2つに分かれる。どっちかが残っていればセーフ',
      pinch: 75, pieceScale: 0.62, massScale: 0.6,
    },
  },
  {
    id: 'gardon', rarity: 'rare',
    name: 'ガードン',
    desc: 'カバー（スリーブ）つき。はじめはカバーで守られている',
    shape: { type: 'rect', w: 62, h: 32, chamfer: 4 },
    look: { art: 'cover', body: '#f8f8f3', sleeve: '#26a69a' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: {
      id: 'cover', name: 'カバー',
      desc: 'カバーがあるあいだは重い。強く当たるとカバーが外れて、軽くすべりやすくなる。外れたカバーは机にころがる',
      massScale: 1.3, breakPower: 7, afterMass: 0.95, afterFriction: 0.95,
      drop: { w: 50, h: 16, color: '#26a69a' }, // 外れたカバー（机の上にころがる）
    },
  },
  {
    id: 'buruburu', rarity: 'rare',
    name: 'ブルブル',
    desc: '電動消しゴム。ブルブルふるえている',
    shape: { type: 'rect', w: 66, h: 22, chamfer: 8 },
    look: { art: 'electric', body: '#455a64' },
    stats: { power: 2, balance: 3, speed: 4 },
    trait: { id: 'vibrate', name: 'しんどう', desc: '止まりかけても、ふるえて少し前に進む', accel: 0.06, ms: 600 },
  },
  {
    id: 'kachikochi', rarity: 'normal',
    name: 'カチコチ',
    desc: 'かための製図用。よくすべって遠くまで飛ぶ',
    shape: { type: 'rect', w: 64, h: 24, chamfer: 2 },
    look: { body: '#eef3f7', sleeve: '#1f3b57', sleeveText: 'カチコチ' },
    stats: { power: 4, balance: 1, speed: 4 },
    trait: { id: 'brake', name: 'つるーん', desc: '止まりにくい。遠くまですべる', scale: 0.95 },
  },
  {
    id: 'fuwakaru', rarity: 'normal',
    name: 'ポヨン',
    desc: 'やわらかタイプ。ぽよんと はねる',
    shape: { type: 'rect', w: 50, h: 28, chamfer: 10 },
    look: { body: '#ffe6ee', sleeve: '#f48fb1', sleeveText: 'ポヨン' },
    stats: { power: 2, balance: 3, speed: 4 },
    trait: { id: 'bouncy', name: 'ぽよーん', desc: '当たった相手を、大きくはね返す', push: 0.3, max: 5 },
  },
  {
    id: 'twotone', rarity: 'rare',
    name: 'ツートン',
    desc: 'えんぴつ用（赤）とインク用（青）の2色',
    shape: { type: 'rect', w: 66, h: 28, chamfer: 4 },
    look: { art: 'twotone', front: '#ef5350', back: '#42a5f5' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: {
      id: 'twoTone', name: 'まえとうしろ',
      desc: '赤い側で当てると相手を強く押す。青い側は当てられても動きにくい',
      attack: 0.2, defend: 0.8, max: 4,
    },
  },
  {
    id: 'gattain', rarity: 'superrare',
    name: 'ガッタイン',
    desc: '組み立て式のおもしろ消しゴム',
    shape: { type: 'rect', w: 64, h: 34, chamfer: 3 },
    look: { art: 'parts', body: '#fff3e0' },
    stats: { power: 2, balance: 5, speed: 2 },
    trait: {
      id: 'parts', name: 'パーツ',
      desc: '強く当たるとパーツが外れて、軽く・速く・強くなる（3回まで）。外れたパーツは机にころがる',
      count: 3, breakPower: 7, massStep: 0.93, frictionStep: 0.97, speedStep: 1.08,
      // 外れたパーツ（のこりの数の番号のものが外れる：ぼうし→右うで→左うで）
      drops: [
        { w: 10, h: 22, color: '#42a5f5' },
        { w: 10, h: 22, color: '#ef5350' },
        { w: 22, h: 10, color: '#ffca28' },
      ],
    },
  },
  {
    id: 'cap', rarity: 'normal',
    name: 'エンピツボウシ',
    desc: '鉛筆のおしりの消しゴム。超小型・超軽量。当たれば強いけど扱いが難しい',
    shape: { type: 'rect', w: 24, h: 24, chamfer: 8 },
    look: { body: '#ff9cc0', sleeve: '#c9ccd1', sleeveRatio: 0.32 },
    stats: { power: 5, balance: 1, speed: 3 },
  },
  {
    id: 'sankaku', rarity: 'normal',
    name: 'さんかくけし',
    desc: 'とがった三角。当たるとくるくる回る',
    shape: { type: 'polygon', sides: 3, radius: 34 },
    look: { body: '#c9f2d9', facet: '#8fd8ad' },
    stats: { power: 5, balance: 2, speed: 2 },
  },
  {
    id: 'cube', rarity: 'normal',
    name: 'キューブけし',
    desc: 'まっ四角。どこから当たっても安定',
    shape: { type: 'rect', w: 42, h: 42, chamfer: 5 },
    look: { body: '#fbfbf4', sleeve: '#ff8a3d', sleeveText: 'かく', sleeveRatio: 0.6 },
    stats: { power: 2, balance: 4, speed: 3 },
  },

  // ---- キャラ消しゴム（オリジナルの動物） ----
  {
    id: 'neko', rarity: 'normal', kind: 'chara',
    name: 'ねこまる',
    desc: 'きまぐれな ねこの消しゴム。すばしっこい',
    shape: { type: 'circle', radius: 24 },
    look: { art: 'cat', body: '#ffb74d' },
    stats: { power: 3, balance: 2, speed: 4 },
  },
  {
    id: 'inu', rarity: 'normal', kind: 'chara',
    name: 'わんけし',
    desc: 'げんきな いぬの消しゴム。体当たりがとくい',
    shape: { type: 'circle', radius: 25 },
    look: { art: 'dog', body: '#c8a27a' },
    stats: { power: 4, balance: 3, speed: 2 },
  },
  {
    id: 'dino', rarity: 'rare', kind: 'chara',
    name: 'ガオザウルス',
    desc: 'きょうりゅうの消しゴム。どっしり強い',
    shape: { type: 'rect', w: 66, h: 34, chamfer: 12 },
    look: { art: 'dino', body: '#66bb6a' },
    stats: { power: 4, balance: 4, speed: 1 },
  },
  {
    id: 'usagi', rarity: 'rare', kind: 'chara',
    name: 'ぴょんうさ',
    desc: 'うさぎの消しゴム。ぴょんぴょん よくすべる',
    shape: { type: 'circle', radius: 22 },
    look: { art: 'rabbit', body: '#fafafa' },
    stats: { power: 3, balance: 2, speed: 4 },
  },
  {
    id: 'penguin', rarity: 'normal', kind: 'chara',
    name: 'ペンペン',
    desc: 'ペンギンの消しゴム。氷の上みたいに すーっと',
    shape: { type: 'circle', radius: 23 },
    look: { art: 'penguin', body: '#37474f' },
    stats: { power: 2, balance: 4, speed: 3 },
  },
  {
    id: 'panda', rarity: 'rare', kind: 'chara',
    name: 'パンダン',
    desc: 'パンダの消しゴム。のんびり どっしり',
    shape: { type: 'circle', radius: 26 },
    look: { art: 'panda', body: '#ffffff' },
    stats: { power: 2, balance: 5, speed: 2 },
  },
  {
    id: 'buta', rarity: 'normal', kind: 'chara',
    name: 'こぶたん',
    desc: 'こぶたの消しゴム。まるくて ふんばる',
    shape: { type: 'circle', radius: 25 },
    look: { art: 'pig', body: '#f8bbd0' },
    stats: { power: 3, balance: 4, speed: 2 },
  },
  {
    id: 'kaeru', rarity: 'rare', kind: 'chara',
    name: 'ケロッパ',
    desc: 'かえるの消しゴム。ジャンプ力（パワー）じまん',
    shape: { type: 'circle', radius: 23 },
    look: { art: 'frog', body: '#8bc34a' },
    stats: { power: 4, balance: 1, speed: 4 },
  },
  {
    id: 'kame', rarity: 'rare', kind: 'chara',
    name: 'カメノスケ',
    desc: 'かめの消しゴム。こうらで まもりはバッチリ',
    shape: { type: 'polygon', sides: 6, radius: 30 },
    look: { art: 'turtle', body: '#8d6e63' },
    stats: { power: 1, balance: 5, speed: 3 },
  },
  {
    id: 'hiyoko', rarity: 'normal', kind: 'chara',
    name: 'ヒヨピヨ',
    desc: 'ひよこの消しゴム。小さくて ちょこまか',
    shape: { type: 'circle', radius: 20 },
    look: { art: 'chick', body: '#ffe082' },
    stats: { power: 4, balance: 1, speed: 4 },
  },

  // ---- ここからガチャ限定の文房具 ----
  {
    id: 'stapler', rarity: 'rare', gacha: true,
    name: 'ホッチキス',
    desc: 'がっしり重い。ガチャンと当てる',
    shape: { type: 'rect', w: 70, h: 26, chamfer: 6 },
    look: { art: 'stapler', body: '#2f4a7a' },
    stats: { power: 3, balance: 4, speed: 2 },
  },
  {
    id: 'enpitsu', rarity: 'normal', gacha: true,
    name: 'えんぴつ',
    desc: 'ほそ長くて、すーっとよく走る',
    shape: { type: 'rect', w: 78, h: 14, chamfer: 4 },
    look: { art: 'pencil', body: '#f6c445' },
    stats: { power: 4, balance: 1, speed: 4 },
  },
  {
    id: 'sharpen', rarity: 'rare', gacha: true,
    name: 'シャーペン',
    desc: 'するどい一撃。パワー自まん',
    shape: { type: 'rect', w: 84, h: 12, chamfer: 4 },
    look: { art: 'mechpencil', body: '#6aa8ff' },
    stats: { power: 5, balance: 2, speed: 2 },
  },
  {
    id: 'hasami', rarity: 'rare', gacha: true,
    name: 'はさみ',
    desc: 'チョキッと切りこむ。バランスがいい',
    shape: { type: 'rect', w: 64, h: 30, chamfer: 8 },
    look: { art: 'scissors', body: '#e53935' },
    stats: { power: 4, balance: 2, speed: 3 },
  },
  {
    id: 'clip', rarity: 'normal', gacha: true,
    name: 'クリップ',
    desc: '小さくて すばしっこい',
    shape: { type: 'rect', w: 48, h: 18, chamfer: 9 },
    look: { art: 'clip', body: '#26a69a' },
    stats: { power: 3, balance: 2, speed: 4 },
  },
  {
    id: 'nori', rarity: 'normal', gacha: true,
    name: 'スティックのり',
    desc: 'ぺたっと ふんばる。なかなか動かない',
    shape: { type: 'rect', w: 60, h: 22, chamfer: 6 },
    look: { art: 'glue', body: '#f5f5f5', label: '#8e6bd6' },
    stats: { power: 1, balance: 5, speed: 3 },
  },
  {
    id: 'compass', rarity: 'superrare', gacha: true,
    name: 'コンパス',
    desc: '三本足（？）の名人。くるっと回る',
    shape: { type: 'polygon', sides: 3, radius: 32 },
    look: { art: 'compass', body: '#b0bec5' },
    stats: { power: 4, balance: 3, speed: 2 },
  },
  {
    id: 'bundoki', rarity: 'rare', gacha: true,
    name: 'ぶんどき',
    desc: 'まんまるの すける板。ころころすべる',
    shape: { type: 'circle', radius: 30 },
    look: { art: 'protractor', body: '#bfe3ff' },
    stats: { power: 3, balance: 3, speed: 3 },
  },
  {
    id: 'tape', rarity: 'normal', gacha: true,
    name: 'セロハンテープ',
    desc: 'どっしり ずっしり。まもりの王さま',
    shape: { type: 'circle', radius: 27 },
    look: { art: 'tape', body: '#e3f2fd' },
    stats: { power: 2, balance: 5, speed: 2 },
  },
  {
    id: 'marker', rarity: 'normal', gacha: true,
    name: 'けいこうペン',
    desc: 'ピカッと目立つ。スピードとパワーのバランス型',
    shape: { type: 'rect', w: 74, h: 20, chamfer: 8 },
    look: { art: 'marker', body: '#ffe94d' },
    stats: { power: 3, balance: 2, speed: 4 },
  },

  // ---- ここからガチャ限定の「とくべつ消しゴム」（強さより クセと見た目で勝負。ステータスの合計は9のまま） ----
  {
    id: 'kirarin', rarity: 'rare', gacha: true, kind: 'special',
    name: 'キラリン',
    desc: 'ラメ入りの キラキラ消しゴム',
    shape: { type: 'rect', w: 56, h: 30, chamfer: 6 },
    look: { art: 'glitter', body: '#f8bbd0' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: { id: 'glare', name: 'まぶしい', desc: 'まぶしくて、相手が弾く向きが すこし ブレる（矢印もゆれる）', spread: 0.09 },
  },
  {
    id: 'korocoin', rarity: 'rare', gacha: true, kind: 'special',
    name: 'コロコイン',
    desc: '平たい 円ばん型',
    shape: { type: 'circle', radius: 27 },
    look: { art: 'coin', body: '#ffd54f' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: { id: 'brake', name: 'スーッ', desc: '机の上を スーッと 長くすべる', scale: 0.86 },
  },
  {
    id: 'saikoron', rarity: 'rare', gacha: true, kind: 'special',
    name: 'サイコロン',
    desc: 'サイコロの形の 消しゴム',
    shape: { type: 'rect', w: 38, h: 38, chamfer: 7 },
    look: { art: 'dice', body: '#ffffff' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: {
      id: 'dice', name: 'サイコロ',
      desc: '自分の番が来るたびに サイコロをふって、出た目で その番の能力が かわる',
      // 出た目ごとの能力（mass＝重さ、brake＝ブレーキ、power＝弾く力の倍率）
      faces: [
        { name: 'ずっしり', mass: 1.5 },
        { name: 'ふわふわ', mass: 0.7, power: 1.1 },
        { name: 'パワー', power: 1.2 },
        { name: 'すべすべ', brake: 0.75 },
        { name: 'ピタッ', brake: 1.6 },
        { name: 'ラッキー', mass: 1.2, power: 1.12 },
      ],
    },
  },
  {
    id: 'sushikeshi', rarity: 'rare', gacha: true, kind: 'special',
    name: 'スシケシ',
    desc: 'おすしの形の 消しゴム（サーモン）',
    shape: { type: 'rect', w: 58, h: 28, chamfer: 11 },
    look: { art: 'sushi', body: '#fffaf0', neta: '#ff8a65' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: {
      id: 'cover', name: 'ネタとび',
      desc: 'はじめはネタがのっていて重い。強く当たると ネタが飛んで、シャリだけ 軽くなる（ネタは机にころがる）',
      massScale: 1.3, breakPower: 7, afterMass: 0.9, afterFriction: 0.95,
      drop: { w: 46, h: 14, color: '#ff8a65', look: 'neta' },
    },
  },
  {
    id: 'donut', rarity: 'rare', gacha: true, kind: 'special',
    name: 'ドーナッツ',
    desc: 'あなあきの ドーナツ型',
    shape: { type: 'circle', radius: 26 },
    look: { art: 'donut', body: '#e0a96d', icing: '#f48fb1' },
    stats: { power: 3, balance: 2, speed: 4 },
    trait: { id: 'spinny', name: 'くるりん', desc: '軽くて、いつも くるくる回りながら ぶつかる', spinScale: 1.5, damping: 0.25, autoSpin: 0.32 },
  },
  {
    id: 'blocken', rarity: 'superrare', gacha: true, kind: 'special',
    name: 'ブロッケン',
    desc: 'つみかさねられる ブロック型',
    shape: { type: 'rect', w: 56, h: 28, chamfer: 2 },
    look: { art: 'brick', body: '#42a5f5' },
    stats: { power: 3, balance: 4, speed: 2 },
    trait: { id: 'block', name: 'ぶんしんブロック', desc: 'はじめて弾いたとき、うしろに ブロックを1こ のこして 壁にする（1回だけ）', length: 58, width: 24 },
  },
  {
    id: 'rocketter', rarity: 'superrare', gacha: true, kind: 'special',
    name: 'ロケッター',
    desc: 'ロケットの形の 消しゴム',
    shape: { type: 'rect', w: 66, h: 24, chamfer: 10 },
    look: { art: 'rocket', body: '#eceff1' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: { id: 'rocket', name: 'ブースト', desc: 'ぐーっと強く ひっぱって弾くと（8わり以上）、まっすぐ ロケット突進', minPower: 0.8, accel: 0.24, ms: 450 },
  },
  {
    id: 'ninjakeshi', rarity: 'superrare', gacha: true, kind: 'special',
    name: 'ニンジャケシ',
    desc: 'にんじゃの 組み立て消しゴム',
    shape: { type: 'rect', w: 44, h: 34, chamfer: 7 },
    look: { art: 'ninja', body: '#37474f' },
    stats: { power: 3, balance: 2, speed: 4 },
    trait: { id: 'dodge', name: 'ぶんしんの術', desc: '1回だけ、当てられた しゅんかんに ドロンと よこへ よける', minPower: 3 },
  },
  {
    id: 'hikarun', rarity: 'superrare', gacha: true, kind: 'special',
    name: 'ヒカルン',
    desc: 'くらいところで光る 蓄光消しゴム',
    shape: { type: 'rect', w: 54, h: 30, chamfer: 8 },
    look: { art: 'glow', body: '#d7ffd9', glow: '#76ff03' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: { id: 'glow', name: 'ちくこう', desc: 'くらい「よるの教室」の机では、パワー・おもさ・すべりが ぜんぶ アップ', mass: 1.2, power: 1.12, slide: 0.9 },
  },
  {
    id: 'irokawaru', rarity: 'superrare', gacha: true, kind: 'special',
    name: 'イロカワール',
    desc: 'あたたかさで 色がかわる消しゴム',
    shape: { type: 'rect', w: 56, h: 30, chamfer: 8 },
    look: { art: 'thermo', body: '#ba68c8' },
    stats: { power: 3, balance: 2, speed: 4 },
    trait: {
      id: 'clear', camo: true, name: 'カメレオン',
      desc: '弾いて止まると、つぎの自分の番まで 机の色に とけこんで 見えにくい',
      aimErrorDeg: 12, alpha: 0.2,
    },
  },
  {
    id: 'togetogen', rarity: 'superrare', gacha: true, kind: 'special',
    name: 'トゲトゲン',
    desc: 'トゲトゲの形の 消しゴム',
    shape: { type: 'polygon', sides: 8, radius: 27 },
    look: { art: 'spiky', body: '#9ccc65' },
    stats: { power: 3, balance: 4, speed: 2 },
    trait: { id: 'bouncy', name: 'トゲトゲ', desc: 'さわった相手を、小さく はね返す（ゆっくり当たっても）', push: 0.15, min: 1.2, max: 3 },
  },
  {
    id: 'jishakun', rarity: 'superrare', gacha: true, kind: 'special',
    name: 'ジシャクン',
    desc: 'じしゃく入り（という せってい）',
    shape: { type: 'rect', w: 52, h: 30, chamfer: 4 },
    look: { art: 'magnet', body: '#ef5350' },
    stats: { power: 3, balance: 4, speed: 2 },
    trait: { id: 'magnet', name: 'じりょく', desc: '近くを通る 相手の消しゴムを、すこし 引きよせる', range: 140, accel: 0.09 },
  },
  {
    id: 'icekeshi', rarity: 'superrare', gacha: true, kind: 'special',
    name: 'アイスケシ',
    desc: 'アイスクリームの形の 消しゴム',
    shape: { type: 'circle', radius: 25 },
    look: { art: 'icecream', body: '#b3e5fc', scoop: '#f8bbd0' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: {
      id: 'ice', name: 'こおりの道',
      desc: '自分が弾いて 通ったところが こおって、相手が すべりやすくなる（自分は へいき。古いところから とける）',
      radius: 30, scale: 0.45, spacing: 34, max: 14,
    },
  },
  {
    id: 'tamagon', rarity: 'ultra', gacha: true, kind: 'special',
    name: 'タマゴン',
    desc: 'たまごの形の 消しゴム。中に なにかいる…？',
    shape: { type: 'circle', radius: 26 },
    look: { art: 'egg', body: '#fff8e1' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: { id: 'egg', name: 'なにがでるかな', desc: '強く当たると からが われて、中から ランダムで ほかの消しゴムが 出てくる', breakPower: 6 },
  },
  {
    id: 'yureikeshi', rarity: 'ultra', gacha: true, kind: 'special',
    name: 'ユウレイケシ',
    desc: 'はんとうめいの おばけ消しゴム',
    shape: { type: 'rect', w: 50, h: 34, chamfer: 15 },
    look: { art: 'ghost', body: '#eef2ff' },
    stats: { power: 3, balance: 2, speed: 4 },
    trait: { id: 'ghost', name: 'すりぬけ', desc: '1回だけ、当てられた番のあいだ 相手が スーッと すりぬける', minPower: 2.5 },
  },
  {
    id: 'kagamin', rarity: 'ultra', gacha: true, kind: 'special',
    name: 'カガミン',
    desc: 'かがみのような ケースつき',
    shape: { type: 'rect', w: 56, h: 32, chamfer: 4 },
    look: { art: 'mirror', body: '#cfd8dc' },
    stats: { power: 2, balance: 4, speed: 3 },
    trait: { id: 'mirror', name: 'はねかえし', desc: '1回だけ、当てられた力を そのまま相手に はね返す', minPower: 2.5, reflect: 1 },
  },
  {
    id: 'kyoryu', rarity: 'ultra', gacha: true, kind: 'special',
    name: 'キョウリュウ',
    desc: 'きょうりゅうの 組み立て消しゴム',
    shape: { type: 'rect', w: 62, h: 34, chamfer: 8 },
    look: { art: 'dinokit', body: '#66bb6a' },
    stats: { power: 4, balance: 3, speed: 2 },
    trait: { id: 'tail', name: 'しっぽアタック', desc: '自分の番に 相手に当てると、しっぽで もう1回 ペシッと押す', push: 2.6, delayMs: 220 },
  },
  {
    id: 'karappo', rarity: 'ultra', gacha: true, kind: 'special',
    name: 'カラッポ',
    desc: '中身のない ケースだけ（ネタ枠）',
    shape: { type: 'rect', w: 82, h: 42, chamfer: 4 },
    look: { art: 'emptycase', body: '#4fc3f7' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: { id: 'light', name: 'からっぽ', desc: '中身がないので かるい。でも 大きくて けっこう じゃま', weight: 0.8 },
  },
  {
    id: 'daioukeshi', rarity: 'legend', gacha: true, kind: 'special',
    name: 'ダイオウケシ',
    desc: '記念品サイズの 超きょだい消しゴム',
    shape: { type: 'rect', w: 112, h: 62, chamfer: 8 },
    look: { art: 'giant', body: '#fafafa', sleeve: '#7b1fa2' },
    stats: { power: 3, balance: 5, speed: 1 },
    trait: { id: 'charge', name: 'ためうち', desc: '超きょだいで、ほぼ落ちない。そのかわり 1回弾くと、つぎの自分の番は「ためる」お休みになる', weight: 1.6 },
  },
  {
    id: 'massara', rarity: 'legend', gacha: true, kind: 'special',
    name: 'マッサラ',
    desc: '新品 みしよう。かどが ピンピン',
    shape: { type: 'rect', w: 58, h: 30, chamfer: 0 },
    look: { art: 'brandnew', body: '#ffffff', sleeve: '#1565c0' },
    stats: { power: 3, balance: 3, speed: 3 },
    trait: { id: 'corner', name: 'かどアタック', desc: 'ぜんぶの力が すこし高い。さいしょに 相手に当てた 一撃だけ 超強力', allUp: 1.06, push: 0.8, max: 9 },
  },
];

// はじめから持っている消しゴム（図鑑）
export const START_ERASER_IDS = ['white-standard'];
// ふつうの消しゴム（キャラもふくむ。CPU もこの中から選ぶ）と、ガチャ限定の文房具
export const REGULAR_ERASERS = ERASERS.filter((e) => !e.gacha);
export const GACHA_ERASERS = ERASERS.filter((e) => e.gacha);
// ガチャの中の、文房具と とくべつ消しゴム（図鑑のページ分け）
export const STATIONERY_ERASERS = GACHA_ERASERS.filter((e) => e.kind !== 'special');
export const SPECIAL_ERASERS = GACHA_ERASERS.filter((e) => e.kind === 'special');

export const findEraser = (id) => ERASERS.find((e) => e.id === id);
