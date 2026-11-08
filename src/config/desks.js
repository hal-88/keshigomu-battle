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
    desc: '普通の机。まずはここから',
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
    desc: '角がなくて、狭い',
    shape: { type: 'circle', radius: 235 },
    frictionScale: 1.0,
    look: { style: 'wood', top: '#d9a873', edge: '#94653b', grain: '#c58f58' },
  },
  {
    id: 'wax',
    name: 'ワックス机',
    desc: 'つるつるで、よく滑る',
    shape: { type: 'rect', w: 640, h: 420 },
    frictionScale: 0.75,
    startSpreadY: 0.34, seatTilt: 0.6,
    look: { style: 'wax', top: '#ecc995', edge: '#ad7d4d', grain: '#d9b27a' },
  },
  {
    id: 'night',
    name: '夜の教室',
    desc: '真っ暗！ 光る消しゴムが 強くなる',
    badge: '暗い',
    shape: { type: 'rect', w: 640, h: 420 },
    frictionScale: 1.0,
    startSpreadY: 0.34, seatTilt: 0.6,
    dark: true, // くらい机（ヒカルンの ちくこう が はたらく）
    look: { style: 'night', top: '#3b4568', edge: '#1f2540', grain: '#47527a' },
  },
  {
    id: 'giant',
    name: '巨人の机',
    desc: '超巨大！広々使える',
    badge: 'でかい！',
    shape: { type: 'rect', w: 1300, h: 860 },
    frictionScale: 1.0,
    startSpread: 0.13,
    autoCamera: true,
    suddenDeath: { shrinkPerTurn: 55 },
    look: { style: 'wood', top: '#d7b07c', edge: '#8e6236', grain: '#c39662' },
  },

  // ---- 教室シリーズ（しかけつき。features の書き方は Game.js の _setupStage） ----
  {
    id: 'han',
    name: '班の机',
    desc: '4つの机をくっつけた。すき間で止まる',
    badge: 'すき間',
    shape: { type: 'rect', w: 760, h: 520 },
    frictionScale: 1.0,
    seatTiltAll: Math.PI / 4, // すき間の十字をさけて、それぞれの机に すわる
    startSpread: 0.3,
    look: { style: 'wood', top: '#e3c08e', edge: '#a87a4c', grain: '#cfa46d' },
    features: {
      zones: [
        { kind: 'gap', x: 0, y: 0, w: 14, h: 520, scale: 3.5 }, // たてのすき間（落ちない。止まる）
        { kind: 'gap', x: 0, y: 0, w: 760, h: 14, scale: 3.5 }, // よこのすき間
      ],
    },
  },
  {
    id: 'rika',
    name: '理科室の机',
    desc: '真ん中にガスバーナー。はしの流しに落ちる！',
    badge: '流し',
    shape: { type: 'rect', w: 720, h: 440 },
    frictionScale: 1.0,
    startSpreadY: 0.34, seatTilt: 0.6,
    look: { style: 'lab', top: '#2b2f36', edge: '#15181d', grain: '#3a404a' },
    features: {
      // 置物（動かない）。kind で絵がかわる。ガス栓とバーナーは ゴムホースでつながる
      posts: [
        { kind: 'burner', x: 0, y: 0, r: 24, bounce: 0.9 },
        { kind: 'tap', x: 60, y: -190, r: 15, bounce: 0.8 },
        { kind: 'beaker', x: -150, y: -140, r: 20, bounce: 0.5 },
        { kind: 'flask', x: 170, y: 140, r: 22, bounce: 0.5 },
      ],
      holes: [
        { kind: 'sink', x: -300, y: 0, w: 56, h: 110 },
        { kind: 'sink', x: 300, y: 0, w: 56, h: 110 },
      ],
    },
  },
  {
    id: 'zuko',
    name: '図工室の机',
    desc: '彫刻刀のみぞで曲がる。絵の具はつるっ',
    badge: 'みぞ',
    shape: { type: 'rect', w: 660, h: 430 },
    frictionScale: 1.0,
    startSpreadY: 0.34, seatTilt: 0.6,
    look: { style: 'old', top: '#c99a62', edge: '#7d5530', grain: '#a9784a' },
    features: {
      grooves: [
        { x1: -250, y1: -120, x2: -40, y2: 30, width: 12, pull: 0.08 },
        { x1: 60, y1: -150, x2: 230, y2: -20, width: 12, pull: 0.08 },
        { x1: -120, y1: 120, x2: 150, y2: 90, width: 12, pull: 0.08 },
      ],
      zones: [
        { kind: 'paint', x: 150, y: 60, r: 42, scale: 0.4, color: '#3b82f6' },
        { kind: 'paint', x: -170, y: -10, r: 36, scale: 0.4, color: '#ef4444' },
        { kind: 'paint', x: 20, y: -100, r: 30, scale: 0.4, color: '#facc15' },
      ],
    },
  },
  {
    id: 'kateika',
    name: '家庭科室の調理台',
    desc: 'ステンレスでつるつる。まな板はすべりにくい',
    badge: 'つるつる',
    shape: { type: 'rect', w: 680, h: 440 },
    frictionScale: 0.7,
    startSpreadY: 0.34, seatTilt: 0.6,
    look: { style: 'steel', top: '#cfd6dc', edge: '#7c8892', grain: '#bcc5cd' },
    features: {
      zones: [
        { kind: 'board', x: -100, y: 25, w: 150, h: 100, scale: 2 },
        { kind: 'board', x: 100, y: -25, w: 150, h: 100, scale: 2 },
      ],
      // まな板の上の 包丁（動かない。四角）
      posts: [
        { kind: 'knife', x: -90, y: 30, w: 96, h: 16, angle: -0.35, bounce: 0.6 },
        { kind: 'knife', x: 90, y: -15, w: 96, h: 16, angle: 0.35, bounce: 0.6 },
      ],
    },
  },
  {
    id: 'kyushokuTime',
    name: '給食の時間',
    desc: 'トレーのふちが段差。牛乳がこぼれる！',
    badge: '牛乳',
    shape: { type: 'rect', w: 660, h: 430 },
    frictionScale: 1.0,
    startSpreadY: 0.34, seatTilt: 0.6,
    look: { style: 'wood', top: '#e8cfa2', edge: '#a8835a', grain: '#d6b884' },
    features: {
      zones: [
        { kind: 'rim', x: -150, y: 95, w: 200, h: 140, rim: 12, scale: 3.5 },
        { kind: 'rim', x: 150, y: -95, w: 200, h: 140, rim: 12, scale: 3.5 },
      ],
      spills: { every: 3, r: 50, scale: 0.35, max: 3 }, // 3ターンに1回 牛乳がこぼれる
    },
  },
];

export const findDesk = (id) => DESKS.find((d) => d.id === id);
