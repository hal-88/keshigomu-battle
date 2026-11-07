// 机の設定。ここに1項目追加すれば、新しい机が増える。
//
// shape … rect（w×h）または circle（radius）。机の中心が (0, 0)
// frictionScale … すべりやすさ。1が標準、小さいほどつるつる
// look … 天板(top)・ふち(edge)・模様(grain)の色。style は模様の種類（wood / steel / wax）
// （なくてもよい）
// startSpread … はじめの位置の広がり（机の大きさに対する割合、ふつうは 0.3）
// 1人目は手前（画面の下）。そこから時計回りにすわる
// startSpreadY … 2人のとき、たて方向だけ広がりを変える（なければ startSpread と同じ）
// seatTilt    … 2人のとき、席をななめにずらす角度（ラジアン）。手前の左と むこうの右になる
// autoCamera  … 大きい机で、カメラが消しゴムのいるあたりにズームする
// suddenDeath … サドンデスの数値をこの机だけ変える（game.js の suddenDeath と同じ形）
// badge       … 選ぶ画面の右上に出る文字

export const DESKS = [
  {
    id: 'study',
    name: '学習机',
    desc: 'ふつうの机。まずはここから',
    shape: { type: 'rect', w: 640, h: 420 },
    frictionScale: 1.0,
    startSpreadY: 0.34, seatTilt: 0.6, // 手前の左と むこうの右（まっすぐ上下だと近すぎて、先攻が有利すぎる）
    look: { style: 'wood', top: '#e3c08e', edge: '#a87a4c', grain: '#cfa46d' },
  },
  {
    id: 'kyushoku',
    name: '給食台',
    desc: '細長くて、すぐ落ちる',
    shape: { type: 'rect', w: 780, h: 250 },
    frictionScale: 1.0,
    seatTilt: 0.95, // 細長いので、手前の左と むこうの右に ななめに すわる（まっすぐ上下だと近すぎる）
    look: { style: 'steel', top: '#dfe5ea', edge: '#8f9ba5', grain: '#c7d0d8' },
  },
  {
    id: 'round',
    name: '丸テーブル',
    desc: 'カドがなくて、せまい',
    shape: { type: 'circle', radius: 235 },
    frictionScale: 1.0,
    look: { style: 'wood', top: '#d9a873', edge: '#94653b', grain: '#c58f58' },
  },
  {
    id: 'wax',
    name: 'ワックス机',
    desc: 'つるつるで、よくすべる',
    shape: { type: 'rect', w: 640, h: 420 },
    frictionScale: 0.75,
    startSpreadY: 0.34, seatTilt: 0.6,
    look: { style: 'wax', top: '#ecc995', edge: '#ad7d4d', grain: '#d9b27a' },
  },
  {
    id: 'night',
    name: 'よるの教室',
    desc: 'まっくら！ 光る消しゴムが 強くなる',
    badge: 'くらい',
    shape: { type: 'rect', w: 640, h: 420 },
    frictionScale: 1.0,
    startSpreadY: 0.34, seatTilt: 0.6,
    dark: true, // くらい机（ヒカルンの ちくこう が はたらく）
    look: { style: 'night', top: '#3b4568', edge: '#1f2540', grain: '#47527a' },
  },
  {
    id: 'giant',
    name: 'きょじんの机',
    desc: '超巨大！ひろびろ使える',
    badge: 'でかい！',
    shape: { type: 'rect', w: 1300, h: 860 },
    frictionScale: 1.0,
    startSpread: 0.13,
    autoCamera: true,
    suddenDeath: { shrinkPerTurn: 55 },
    look: { style: 'wood', top: '#d7b07c', edge: '#8e6236', grain: '#c39662' },
  },
];

export const findDesk = (id) => DESKS.find((d) => d.id === id);
