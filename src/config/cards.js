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
  fun: { label: 'お楽しみ', color: '#f59e0b' },
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
    desc: 'このターン、2回続けて弾ける',
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
    id: 'magnet', name: '磁石', icon: '🧲', type: 'attack', rarity: 'normal',
    desc: '弾いたら、一番近い相手に 吸い寄せられる',
    params: { accel: 0.3, maxMs: 1300 },
  },
  {
    id: 'fullpower', name: 'フルパワー', icon: '💪', type: 'attack', rarity: 'normal',
    desc: 'このターン、いつもの1.5倍の強さで弾ける',
    params: { powerScale: 1.5 },
  },
  {
    id: 'anchor', name: '重り', icon: '⚓', type: 'defense', rarity: 'normal',
    desc: '次の自分のターンまで、当てられても動かない',
  },
  {
    id: 'barrier', name: 'バリア', icon: '✏️', type: 'defense', rarity: 'normal',
    desc: '鉛筆を1本置いて壁にする（最後まで残る）',
    place: 'pencil',
    params: { length: 150, width: 14 },
  },
  {
    id: 'hold', name: '踏みとどまり', icon: '🦶', type: 'defense', rarity: 'rare',
    desc: '次の自分のターンまでに落ちても、1回だけ縁で止まる',
    params: { graceMs: 500 },
  },
  {
    id: 'mini', name: 'ちびっこ', icon: '🐜', type: 'defense', rarity: 'normal',
    desc: '自分のターン2回分、すごく小さく軽くなって 当たりにくい',
    params: { sizeScale: 0.45, massScale: 0.45, turns: 2 },
  },
  {
    id: 'grip', name: '滑り止め', icon: '🧤', type: 'defense', rarity: 'normal',
    desc: '弾いたあと、次の自分のターンまで 滑りにくくなる',
    params: { scale: 3 },
  },
  {
    id: 'ruler', name: '定規', icon: '📏', type: 'defense', rarity: 'rare',
    desc: '長い定規を1本置いて壁にする（最後まで残る）',
    place: 'pencil',
    params: { length: 260, width: 20, look: 'ruler' },
  },
  {
    id: 'skip', name: 'スキップ', icon: '💤', type: 'hinder', rarity: 'normal',
    desc: '相手の次のターンを飛ばす',
    target: 'opponent',
  },
  {
    id: 'wax', name: 'ワックスがけ', icon: '✨', type: 'hinder', rarity: 'normal',
    desc: '机の一部をつるつるにする（最後まで）',
    place: 'circle',
    params: { radius: 90, frictionScale: 0.3 },
  },
  {
    id: 'swap', name: '入れ替え', icon: '🔄', type: 'hinder', rarity: 'rare',
    desc: '相手と場所を入れ替える',
    target: 'opponent',
  },
  {
    id: 'fan', name: '扇風機', icon: '🌬️', type: 'hinder', rarity: 'normal',
    desc: '周りの相手を 吹き飛ばす（近いほど強い）',
    params: { range: 380, minSpeed: 1.5, maxSpeed: 7.5 },
  },
  {
    id: 'teleport', name: '瞬間移動', icon: '💫', type: 'move', rarity: 'rare',
    desc: '好きな場所にワープしてから弾ける（縁の近くはダメ）',
    place: 'eraser',
    params: { edgeMargin: 60 },
  },
  {
    id: 'quake', name: '地震', icon: '🌋', type: 'fun', rarity: 'normal',
    desc: '机が揺れて、みんな（自分も）少し動く',
    params: { minSpeed: 2, maxSpeed: 5.5 },
  },
  {
    id: 'guruguru', name: 'ぐるぐる', icon: '😵', type: 'fun', rarity: 'normal',
    desc: 'みんなの消しゴムが くるくる回る',
    params: { minSpin: 0.25, maxSpin: 0.5 },
  },
  {
    id: 'okawari', name: 'おかわり', icon: '🎁', type: 'fun', rarity: 'superrare',
    desc: 'カードを2枚引いて、すぐに2枚とも使える',
    params: { draw: 2 },
  },
  {
    id: 'hazure', name: 'ハズレ', icon: '🙃', type: 'fun', rarity: 'normal',
    desc: '何も起きない…',
  },

  // ---- 2026-11-08 に ふやしたカード ----
  {
    id: 'tameuchi', name: 'ため打ち', icon: '🔋', type: 'attack', rarity: 'normal',
    desc: 'このターンは弾かずに パワーをためる。次の自分のターン 2倍の強さで弾ける',
    params: { powerScale: 2 },
  },
  {
    id: 'cushion', name: 'クッション', icon: '↩️', type: 'attack', rarity: 'normal',
    desc: '弾いたあと、机の縁で1回だけ はね返れる（落ちない）',
    params: { bounce: 0.75 },
  },
  {
    id: 'pierce', name: '貫き', icon: '🚂', type: 'attack', rarity: 'normal',
    desc: '当てた相手を 押したまま、止まらずに 進み続ける',
    params: { keep: 0.9, ms: 600 },
  },
  {
    id: 'bowling', name: 'ボウリング', icon: '🎳', type: 'attack', rarity: 'rare',
    desc: '当てた相手が 他の相手に当たったとき、力が弱まらない',
  },
  {
    id: 'invisible', name: '透明', icon: '🌫️', type: 'defense', rarity: 'rare',
    desc: '自分のターン2回分、相手から見えなくなる（ぶつかることはできる）。クリアンが使うと3回分',
    params: { turns: 2, clearTurns: 3 },
  },
  {
    id: 'pencase', name: '筆箱', icon: '🛡️', type: 'defense', rarity: 'normal',
    desc: '次の自分のターンまで、筆箱で 守る。1回だけ 当たりを防ぐ',
    params: { bounce: 0.35 },
  },
  {
    id: 'extralife', name: 'もう一回', icon: '🔁', type: 'defense', rarity: 'ultra',
    desc: 'このゲーム中、落ちても1回だけ 机の真ん中に 戻ってくる',
  },
  {
    id: 'crumbs', name: '消しくず', icon: '🍪', type: 'hinder', rarity: 'normal',
    desc: '机に消しカスをまく。通ると スピードが落ちる（最後まで）',
    place: 'circle',
    placeHint: '消しカスを まきたいところを タップ！',
    params: { radius: 80, frictionScale: 2.4 },
  },
  {
    id: 'reverse', name: '逆さま', icon: '🔃', type: 'hinder', rarity: 'normal',
    desc: '相手の次のターン、弾く向きが 反対になる',
    target: 'opponent',
  },
  {
    id: 'shrinkbeam', name: '縮めビーム', icon: '🔦', type: 'hinder', rarity: 'normal',
    desc: '相手1人を、相手のターン2回分 小さく軽くして 飛ばされやすくする',
    target: 'opponent',
    params: { sizeScale: 0.6, massScale: 0.6, turns: 2 },
  },
  {
    id: 'thief', name: 'カード泥棒', icon: '🦹', type: 'hinder', rarity: 'superrare',
    desc: '相手の まだ使っていないカードを1枚奪って、自分のものにする',
    target: 'opponent',
  },
  {
    id: 'jump', name: 'ジャンプ', icon: '🦘', type: 'move', rarity: 'normal',
    desc: '弾いたとき、途中で 他の消しゴムや 壁を 飛び越える',
    params: { airMs: 420 },
  },
  {
    id: 'center', name: '真ん中へ', icon: '🎯', type: 'move', rarity: 'normal',
    desc: '机の真ん中の方へ 少し 戻ってから弾ける',
    params: { ratio: 0.5, maxDist: 170 },
  },
  {
    id: 'rewind', name: '巻き戻し', icon: '⏪', type: 'move', rarity: 'rare',
    desc: '自分の場所を、1つ前の自分のターンの初めの場所に 戻す',
  },
  {
    id: 'tilt', name: '傾き', icon: '📐', type: 'fun', rarity: 'normal',
    desc: '机が 一番落ちそうな相手のほうへ 傾く（2ターン）。みんな少しずつ 滑る',
    params: { turns: 2, push: 2.6, drift: 0.03 },
  },
  {
    id: 'blackout', name: '停電', icon: '🔌', type: 'fun', rarity: 'normal',
    desc: '次の人のターンの間 画面が真っ暗になって、みんな見えにくい',
  },
  {
    id: 'roulette', name: 'ルーレット', icon: '🎰', type: 'fun', rarity: 'normal',
    desc: '他のカードの中から ランダムで1枚が出て、すぐに使える',
  },
  {
    id: 'shuffle', name: 'シャッフル', icon: '🔀', type: 'fun', rarity: 'rare',
    desc: 'みんなの場所が ランダムに入れ替わる（縁の近くには行かない）',
    params: { edgeMargin: 60 },
  },
  {
    id: 'blackhole', name: 'ブラックホール', icon: '🕳️', type: 'fun', rarity: 'ultra',
    desc: '机の真ん中に2ターン 穴が開く。近くの消しゴムを 吸い込む（自分も！）',
    params: { turns: 2, radius: 24, range: 190, pull: 0.09, push: 3.5 },
  },
  {
    id: 'seating', name: '席替え', icon: '🪑', type: 'fun', rarity: 'legend',
    desc: '机の上の消しゴムを 全部 好きな場所に 並べ直せる（縁の近くはダメ）',
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
