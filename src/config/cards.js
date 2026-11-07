// 能力カードの設定。ここに1項目追加すれば、カードが増える（効果のしくみは logic/Game.js の useCard）。
//
// type   … attack(攻め) / defense(守り) / hinder(妨害) / move(移動) / fun(おたのしみ)
// rarity … normal / rare / superrare / ultra / legend（RARITY の weight の比で出やすさが決まる）
// place  … 使うときに机の上の場所を選ぶカード（pencil / circle / eraser / seat＝せきがえ）
// placeHint … 場所を選ぶときに出す説明（なければ battle.js の PLACE_HINT）
// target … 相手を1人選ぶカード
// params … 効果の強さなどの数値

export const CARD_TYPES = {
  attack: { label: '攻め', color: '#ef5350' },
  defense: { label: '守り', color: '#3b82f6' },
  hinder: { label: '妨害', color: '#8b5cf6' },
  move: { label: '移動', color: '#10b981' },
  fun: { label: 'おたのしみ', color: '#f59e0b' },
};

export const RARITY = {
  normal: { label: 'ノーマル', weight: 3 },
  rare: { label: 'レア', weight: 1 },
  superrare: { label: 'スーパーレア', weight: 0.35 },
  ultra: { label: 'ウルトラレア', weight: 0.15 }, // SSR
  legend: { label: 'レジェンド', weight: 0.06 }, // UR
};

export const CARDS = [
  {
    id: 'rapid', name: '連打', icon: '👆', type: 'attack', rarity: 'normal',
    desc: 'このターン、2回つづけて弾ける',
    params: { extraFlicks: 1 },
  },
  {
    id: 'big', name: 'ビッグ', icon: '🐘', type: 'attack', rarity: 'normal',
    desc: '自分のターン2回分、すごく大きく重くなる',
    params: { sizeScale: 2.1, massScale: 2.5, turns: 2 },
  },
  {
    id: 'curve', name: 'カーブ', icon: '🌀', type: 'attack', rarity: 'normal',
    desc: '弾いたあと、指でなぞった方へ曲がる',
    params: { accel: 0.45, maxMs: 1600 },
  },
  {
    id: 'magnet', name: 'じしゃく', icon: '🧲', type: 'attack', rarity: 'normal',
    desc: '弾いたら、一番近い相手に すいよせられる',
    params: { accel: 0.3, maxMs: 1300 },
  },
  {
    id: 'fullpower', name: 'フルパワー', icon: '💪', type: 'attack', rarity: 'normal',
    desc: 'このターン、いつもの1.5倍の強さで弾ける',
    params: { powerScale: 1.5 },
  },
  {
    id: 'anchor', name: 'おもり', icon: '⚓', type: 'defense', rarity: 'normal',
    desc: 'つぎの自分のターンまで、当てられても動かない',
  },
  {
    id: 'barrier', name: 'バリア', icon: '✏️', type: 'defense', rarity: 'normal',
    desc: 'えんぴつを1本おいて壁にする（さいごまで残る）',
    place: 'pencil',
    params: { length: 150, width: 14 },
  },
  {
    id: 'hold', name: 'ふみとどまり', icon: '🦶', type: 'defense', rarity: 'rare',
    desc: 'つぎの自分のターンまでに落ちても、1回だけふちで止まる',
    params: { graceMs: 500 },
  },
  {
    id: 'mini', name: 'ちびっこ', icon: '🐜', type: 'defense', rarity: 'normal',
    desc: '自分のターン2回分、すごく小さく軽くなって 当たりにくい',
    params: { sizeScale: 0.45, massScale: 0.45, turns: 2 },
  },
  {
    id: 'grip', name: 'すべりどめ', icon: '🧤', type: 'defense', rarity: 'normal',
    desc: '弾いたあと、つぎの自分のターンまで すべりにくくなる',
    params: { scale: 3 },
  },
  {
    id: 'ruler', name: 'じょうぎ', icon: '📏', type: 'defense', rarity: 'rare',
    desc: '長いじょうぎを1本おいて壁にする（さいごまで残る）',
    place: 'pencil',
    params: { length: 260, width: 20, look: 'ruler' },
  },
  {
    id: 'skip', name: 'スキップ', icon: '💤', type: 'hinder', rarity: 'normal',
    desc: '相手のつぎのターンをとばす',
    target: 'opponent',
  },
  {
    id: 'wax', name: 'ワックスがけ', icon: '✨', type: 'hinder', rarity: 'normal',
    desc: '机の一部をつるつるにする（さいごまで）',
    place: 'circle',
    params: { radius: 90, frictionScale: 0.3 },
  },
  {
    id: 'swap', name: 'いれかえ', icon: '🔄', type: 'hinder', rarity: 'rare',
    desc: '相手と場所をいれかえる',
    target: 'opponent',
  },
  {
    id: 'fan', name: 'せんぷうき', icon: '🌬️', type: 'hinder', rarity: 'normal',
    desc: 'まわりの相手を ふきとばす（近いほど強い）',
    params: { range: 380, minSpeed: 1.5, maxSpeed: 7.5 },
  },
  {
    id: 'teleport', name: '瞬間移動', icon: '💫', type: 'move', rarity: 'rare',
    desc: '好きな場所にワープしてから弾ける（ふちの近くはダメ）',
    place: 'eraser',
    params: { edgeMargin: 60 },
  },
  {
    id: 'quake', name: 'じしん', icon: '🌋', type: 'fun', rarity: 'normal',
    desc: '机がゆれて、みんな（自分も）少し動く',
    params: { minSpeed: 2, maxSpeed: 5.5 },
  },
  {
    id: 'guruguru', name: 'ぐるぐる', icon: '😵', type: 'fun', rarity: 'normal',
    desc: 'みんなの消しゴムが くるくる回る',
    params: { minSpin: 0.25, maxSpin: 0.5 },
  },
  {
    id: 'okawari', name: 'おかわり', icon: '🎁', type: 'fun', rarity: 'superrare',
    desc: 'カードを2枚ひいて、すぐに2枚とも使える',
    params: { draw: 2 },
  },
  {
    id: 'hazure', name: 'ハズレ', icon: '🙃', type: 'fun', rarity: 'normal',
    desc: 'なにも起きない…',
  },

  // ---- 2026-11-08 に ふやしたカード ----
  {
    id: 'tameuchi', name: 'ためうち', icon: '🔋', type: 'attack', rarity: 'normal',
    desc: 'このターンは弾かずに パワーをためる。つぎの自分のターン 2倍の強さで弾ける',
    params: { powerScale: 2 },
  },
  {
    id: 'cushion', name: 'クッション', icon: '↩️', type: 'attack', rarity: 'normal',
    desc: '弾いたあと、机のふちで1回だけ はね返れる（落ちない）',
    params: { bounce: 0.75 },
  },
  {
    id: 'pierce', name: 'つらぬき', icon: '🚂', type: 'attack', rarity: 'normal',
    desc: '当てた相手を おしたまま、止まらずに 進みつづける',
    params: { keep: 0.9, ms: 600 },
  },
  {
    id: 'bowling', name: 'ボウリング', icon: '🎳', type: 'attack', rarity: 'rare',
    desc: '当てた相手が ほかの相手に当たったとき、力が弱まらない',
  },
  {
    id: 'invisible', name: 'とうめい', icon: '🌫️', type: 'defense', rarity: 'rare',
    desc: '自分のターン2回分、相手から見えなくなる（ぶつかることはできる）。クリアンが使うと3回分',
    params: { turns: 2, clearTurns: 3 },
  },
  {
    id: 'pencase', name: 'ふでばこ', icon: '🛡️', type: 'defense', rarity: 'normal',
    desc: 'つぎの自分のターンまで、ふでばこで まもる。1回だけ 当たりをふせぐ',
    params: { bounce: 0.35 },
  },
  {
    id: 'extralife', name: 'もういっかい', icon: '🔁', type: 'defense', rarity: 'ultra',
    desc: 'このゲーム中、落ちても1回だけ 机のまんなかに もどってくる',
  },
  {
    id: 'crumbs', name: 'けしくず', icon: '🍪', type: 'hinder', rarity: 'normal',
    desc: '机に消しカスをまく。通ると スピードが落ちる（さいごまで）',
    place: 'circle',
    placeHint: '消しカスを まきたいところを タップ！',
    params: { radius: 80, frictionScale: 2.4 },
  },
  {
    id: 'reverse', name: 'さかさま', icon: '🔃', type: 'hinder', rarity: 'normal',
    desc: '相手のつぎのターン、弾く向きが 反対になる',
    target: 'opponent',
  },
  {
    id: 'shrinkbeam', name: 'ちぢめビーム', icon: '🔦', type: 'hinder', rarity: 'normal',
    desc: '相手1人を、相手のターン2回分 小さく軽くして 飛ばされやすくする',
    target: 'opponent',
    params: { sizeScale: 0.6, massScale: 0.6, turns: 2 },
  },
  {
    id: 'thief', name: 'カードどろぼう', icon: '🦹', type: 'hinder', rarity: 'superrare',
    desc: '相手の まだ使っていないカードを1枚うばって、自分のものにする',
    target: 'opponent',
  },
  {
    id: 'jump', name: 'ジャンプ', icon: '🦘', type: 'move', rarity: 'normal',
    desc: '弾いたとき、とちゅうで ほかの消しゴムや かべを 飛びこえる',
    params: { airMs: 420 },
  },
  {
    id: 'center', name: 'まんなかへ', icon: '🎯', type: 'move', rarity: 'normal',
    desc: '机のまんなかの方へ すこし もどってから弾ける',
    params: { ratio: 0.5, maxDist: 170 },
  },
  {
    id: 'rewind', name: 'まきもどし', icon: '⏪', type: 'move', rarity: 'rare',
    desc: '自分の場所を、1つ前の自分のターンのはじめの場所に もどす',
  },
  {
    id: 'tilt', name: 'かたむき', icon: '📐', type: 'fun', rarity: 'normal',
    desc: '机が いちばん落ちそうな相手のほうへ かたむく（2ターン）。みんな少しずつ すべる',
    params: { turns: 2, push: 2.6, drift: 0.03 },
  },
  {
    id: 'blackout', name: 'ていでん', icon: '🔌', type: 'fun', rarity: 'normal',
    desc: 'つぎの人のターンのあいだ 画面がまっくらになって、みんな見えにくい',
  },
  {
    id: 'roulette', name: 'ルーレット', icon: '🎰', type: 'fun', rarity: 'normal',
    desc: 'ほかのカードの中から ランダムで1枚が出て、すぐに使える',
  },
  {
    id: 'shuffle', name: 'シャッフル', icon: '🔀', type: 'fun', rarity: 'rare',
    desc: 'みんなの場所が ランダムに入れかわる（ふちの近くには行かない）',
    params: { edgeMargin: 60 },
  },
  {
    id: 'blackhole', name: 'ブラックホール', icon: '🕳️', type: 'fun', rarity: 'ultra',
    desc: '机のまんなかに2ターン 穴があく。近くの消しゴムを すいこむ（自分も！）',
    params: { turns: 2, radius: 24, range: 190, pull: 0.09, push: 3.5 },
  },
  {
    id: 'seating', name: 'せきがえ', icon: '🪑', type: 'fun', rarity: 'legend',
    desc: '机の上の消しゴムを ぜんぶ 好きな場所に ならべなおせる（ふちの近くはダメ）',
    place: 'seat',
    params: { edgeMargin: 60 },
  },
];

export const findCard = (id) => CARDS.find((c) => c.id === id);

/** レア度の重みで1枚ひく（exclude に入れた id のカードは出ない） */
export function drawRandomCard(exclude = []) {
  const pool = CARDS.filter((c) => !exclude.includes(c.id));
  const total = pool.reduce((s, c) => s + RARITY[c.rarity].weight, 0);
  let r = Math.random() * total;
  for (const c of pool) {
    r -= RARITY[c.rarity].weight;
    if (r < 0) return c;
  }
  return pool[pool.length - 1];
}
