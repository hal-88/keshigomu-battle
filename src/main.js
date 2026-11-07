// 画面の流れ：タイトル → モード →（1台でみんなで：だれが遊ぶ？）→ 机 → 消しゴム → カード配布 → 対戦 → 結果

import './style.css';
import { DESKS, findDesk } from './config/desks.js';
import { ERASERS, REGULAR_ERASERS, GACHA_ERASERS, STAT_LABELS, ERASER_RARITY, findEraser, pickByRarity } from './config/erasers.js';
import { CARDS, drawRandomCard } from './config/cards.js';
import { collection } from './progress/collection.js';
import { cardHTML } from './ui/cardView.js';
import { GAME } from './config/game.js';
import { createBattle } from './battle.js';
import { drawEraser, drawEraserPreview } from './render/drawEraser.js';
import { flipCardHTML } from './ui/cardView.js';
import { sfx, unlockAudio } from './audio/sfx.js';
import { setupOnline } from './onlineScreens.js';

const MODES = [
  { id: 'cpu', name: 'CPU れんしょうチャレンジ', desc: 'つぎつぎ ちがう消しゴムのCPUと1対1。何連勝できるかな？', enabled: true },
  { id: 'local', name: '1台でみんなで', desc: '2〜4人でこうたいに（CPUもまぜられる）', enabled: true },
  { id: 'online', name: 'オンライン', desc: 'あいことば（数字）で ともだちと対戦', enabled: true },
];

const app = document.getElementById('app');
const setup = {
  mode: 'cpu',
  deskId: DESKS[0].id,
  eraserIds: [], // 何番目の人がどの消しゴムを選んだか（次に選ぶときのはじめの選択）
  local: {
    count: 2,
    slots: GAME.playerNames.map((name, i) => ({ name, type: i < 2 ? 'human' : 'cpu' })),
  },
};
let battle = null;
let lastPlayers = null;

// 名前を HTML に入れるときは、記号をそのまま文字として出す
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// iPad などは、画面を触ったあとでないと音が出せない
document.addEventListener('pointerdown', unlockAudio, { capture: true });
// ボタンを押したときの音
document.addEventListener('click', (e) => {
  if (e.target.closest('.btn, .choice, .count-btn, .seg button')) sfx.tap();
});

function screen(html, cls = '') {
  battle?.destroy();
  battle = null;
  app.innerHTML = `<div class="screen ${cls}">${html}</div>`;
  return app.firstElementChild;
}

// 描画は Web フォントの読み込みと画面のレイアウトを待ってから
const fontsReady = document.fonts?.ready ?? Promise.resolve();
const whenFonts = (fn) => fontsReady.then(() => requestAnimationFrame(fn));

// ---------- 1. タイトル ----------
function showTitle() {
  const el = screen(
    `<div class="title-box">
       <canvas class="title-art"></canvas>
       <h1 class="title">消しゴム<span>バトル</span></h1>
       <p class="subtitle">はじいて、ぶつけて、机から落とせ！</p>
       <button class="btn big primary" data-act="start">はじめる</button>
       <div class="row title-sub">
         <button class="btn" data-act="zukan">📖 ずかん <small>${collection.ownedErasers().length}/${ERASERS.length}</small></button>
         <button class="btn" data-act="gacha">🎰 ガチャ ${
           collection.tickets() ? `<span class="ticket-badge">🎫${collection.tickets()}</span>` : ''
         }</button>
       </div>
     </div>`,
    'title-screen',
  );
  const cv = el.querySelector('.title-art');
  whenFonts(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = h / 75;
    drawEraser(ctx, findEraser('nerikeshi'), w * 0.08, h * 0.62, 0, { scale: s });
    drawEraser(ctx, findEraser('fuwakaru'), w * 0.25, h * 0.55, 0.35, { scale: s });
    drawEraser(ctx, findEraser('jumbo'), w * 0.5, h * 0.45, -0.12, { scale: s });
    drawEraser(ctx, findEraser('white-standard'), w * 0.75, h * 0.55, -0.4, { scale: s });
    drawEraser(ctx, findEraser('kadodarake'), w * 0.92, h * 0.62, 0.3, { scale: s });
  });
  el.querySelector('[data-act=start]').onclick = showModeSelect;
  el.querySelector('[data-act=zukan]').onclick = () => showZukan();
  el.querySelector('[data-act=gacha]').onclick = showGacha;
}

// ---------- 2. モード ----------
function showModeSelect() {
  const el = screen(
    `<h2 class="head">あそびかたを えらぼう</h2>
     <div class="choices">
       ${MODES.map(
         (m) => `
         <button class="choice ${m.enabled ? '' : 'disabled'}" data-id="${m.id}" ${m.enabled ? '' : 'disabled'}>
           <div class="choice-name">${m.name}</div>
           <div class="choice-desc">${m.desc}</div>
           ${m.id === 'cpu' && collection.bestStreak() ? `<div class="choice-desc best">🏆 ベスト ${collection.bestStreak()}れんしょう</div>` : ''}
           ${m.enabled ? '' : '<div class="badge">じゅんびちゅう</div>'}
         </button>`,
       ).join('')}
     </div>
     <button class="btn ghost" data-act="back">もどる</button>`,
  );
  el.querySelectorAll('.choice:not(.disabled)').forEach((b) => {
    b.onclick = () => {
      setup.mode = b.dataset.id;
      if (setup.mode === 'local') showPlayerSetup();
      else if (setup.mode === 'online') online.showMenu();
      else showDeskSelect();
    };
  });
  el.querySelector('[data-act=back]').onclick = showTitle;
}

// ---------- 2.5 だれが遊ぶ？（1台でみんなで） ----------
function showPlayerSetup() {
  const L = setup.local;
  const counts = [];
  for (let n = GAME.minPlayers; n <= GAME.maxPlayers; n++) counts.push(n);
  const el = screen(
    `<h2 class="head">だれが あそぶ？</h2>
     <div class="count-row">
       <span>にんずう</span>
       ${counts.map((n) => `<button class="count-btn ${n === L.count ? 'on' : ''}" data-n="${n}">${n}人</button>`).join('')}
     </div>
     <div class="slots">
       ${L.slots
         .slice(0, L.count)
         .map(
           (s, i) => `
         <div class="slot" style="--c:${GAME.playerColors[i]}">
           <span class="slot-num">${i + 1}</span>
           <input class="slot-name" data-i="${i}" maxlength="${GAME.nameMaxLength}" value="${esc(s.name)}"
             aria-label="${i + 1}ばんめの名前" autocomplete="off" enterkeyhint="done">
           <div class="seg">
             <button class="${s.type === 'human' ? 'on' : ''}" data-i="${i}" data-type="human">ひと</button>
             <button class="${s.type === 'cpu' ? 'on' : ''}" data-i="${i}" data-type="cpu">CPU</button>
           </div>
         </div>`,
         )
         .join('')}
     </div>
     <p class="note">名前は ニックネームで（${GAME.nameMaxLength}文字まで）。じゅんばんは 上から</p>
     <div class="row">
       <button class="btn ghost" data-act="back">もどる</button>
       <button class="btn big primary" data-act="next">つぎへ</button>
     </div>`,
  );
  el.querySelectorAll('.count-btn').forEach((b) => {
    b.onclick = () => {
      L.count = Number(b.dataset.n);
      showPlayerSetup();
    };
  });
  el.querySelectorAll('.slot-name').forEach((inp) => {
    inp.addEventListener('input', () => {
      L.slots[Number(inp.dataset.i)].name = inp.value;
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') inp.blur();
    });
  });
  el.querySelectorAll('.seg button').forEach((b) => {
    b.onclick = () => {
      L.slots[Number(b.dataset.i)].type = b.dataset.type;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    };
  });
  el.querySelector('[data-act=back]').onclick = showModeSelect;
  el.querySelector('[data-act=next]').onclick = showDeskSelect;
}

// ---------- 3. 机 ----------
function deskThumb(d) {
  const s = d.shape;
  const round = s.type === 'circle';
  const ratio = round ? 1 : s.w / s.h;
  // 机どうしの大きさのちがいがわかるように、いちばん大きい机を 80% にそろえる
  const biggest = Math.max(...DESKS.map((x) => (x.shape.type === 'circle' ? x.shape.radius * 2 : x.shape.w)));
  const width = ((round ? s.radius * 2 : s.w) / biggest) * 80;
  return `<div class="desk-thumb ${d.look.style}" style="background:${d.look.top};border-color:${d.look.edge};
    aspect-ratio:${ratio};width:${width}%;border-radius:${round ? '50%' : '8px'}"></div>`;
}

function showDeskSelect() {
  const el = screen(
    `<h2 class="head">机を えらぼう</h2>
     <div class="choices">
       ${DESKS.map(
         (d) => `
         <button class="choice desk-choice" data-id="${d.id}">
           ${d.badge ? `<div class="badge hot">${d.badge}</div>` : ''}
           <div class="desk-thumb-wrap">${deskThumb(d)}</div>
           <div class="choice-name">${d.name}</div>
           <div class="choice-desc">${d.desc}</div>
         </button>`,
       ).join('')}
     </div>
     <button class="btn ghost" data-act="back">もどる</button>`,
  );
  el.querySelectorAll('.choice').forEach((b) => {
    b.onclick = () => {
      setup.deskId = b.dataset.id;
      pickErasers(makePlayers());
    };
  });
  el.querySelector('[data-act=back]').onclick = setup.mode === 'local' ? showPlayerSetup : showModeSelect;
}

// 遊ぶ人のリスト（消しゴムとカードはこのあと決める）
function makePlayers() {
  if (setup.mode === 'cpu') {
    return [
      { name: 'あなた', type: 'human', color: GAME.playerColors[0] },
      { name: 'CPU', type: 'cpu', level: 'normal', color: GAME.playerColors[1] },
    ];
  }
  return setup.local.slots.slice(0, setup.local.count).map((s, i) => {
    const name = s.name.trim().slice(0, GAME.nameMaxLength) || GAME.playerNames[i];
    return {
      name: s.type === 'cpu' ? `🤖${name}` : name,
      type: s.type,
      level: 'normal',
      color: GAME.playerColors[i],
    };
  });
}

// CPU の消しゴム：まだ持っていない消しゴムを多めに選ぶ（たおすと手に入るので）
// exclude に入っている消しゴムは選ばない（連勝チャレンジで毎回ちがう相手にするため）
function cpuPickEraser(exclude = []) {
  const pick = pickByRarity; // レアな消しゴムほど出てきにくい
  let pool = REGULAR_ERASERS.filter((e) => !exclude.includes(e.id));
  if (!pool.length) pool = REGULAR_ERASERS.filter((e) => e.id !== exclude[exclude.length - 1]);
  const locked = pool.filter((e) => !collection.owns(e.id));
  if (locked.length && Math.random() < GAME.collection.cpuPickLockedChance) return pick(locked);
  return pick(pool);
}

// ---------- CPU 連勝チャレンジ ----------
// 勝つたびに、つぎの相手（毎回ちがう消しゴム）が出てくる。負けたら記録が止まる
let streak = null; // { count: 何連勝中か, used: これまでの相手の消しゴム, newRecord }

function startStreak(humanEraser) {
  streak = { count: 0, used: [], newRecord: false };
  nextStreakBattle(humanEraser);
}

function nextStreakBattle(humanEraser) {
  // ひと回りしたら、使った相手のリストをリセット（直前の相手だけはさける）
  if (streak.used.length >= REGULAR_ERASERS.length) streak.used = streak.used.slice(-1);
  const cpuEraser = cpuPickEraser(streak.used);
  streak.used.push(cpuEraser.id);
  showCardDeal([
    { name: 'あなた', type: 'human', eraser: humanEraser, color: GAME.playerColors[0] },
    { name: 'CPU', type: 'cpu', level: 'normal', eraser: cpuEraser, color: GAME.playerColors[1] },
  ]);
}

// ---------- 4. 消しゴム（ひとの人数ぶん、じゅんばんに） ----------
function pickErasers(players, k = 0) {
  const humans = players.map((p, i) => i).filter((i) => players[i].type === 'human');
  if (k >= humans.length) {
    if (setup.mode === 'cpu') {
      startStreak(players[0].eraser);
      return;
    }
    for (const p of players) {
      if (p.type === 'cpu') p.eraser = cpuPickEraser();
    }
    showCardDeal(players);
    return;
  }
  const i = humans[k];
  const p = players[i];
  const last = k === humans.length - 1;
  showEraserSelect({
    title: setup.mode === 'local' ? `<span style="color:${p.color}">${esc(p.name)}</span>の 消しゴムを えらぼう` : '消しゴムを えらぼう',
    selectedId: collection.owns(setup.eraserIds[i]) ? setup.eraserIds[i] : collection.ownedErasers()[0].id,
    goLabel: last ? 'これでたたかう！' : 'つぎの人へ →',
    onPick: (id) => {
      setup.eraserIds[i] = id;
      p.eraser = findEraser(id);
      pickErasers(players, k + 1);
    },
    onBack: () => (k === 0 ? showDeskSelect() : pickErasers(players, k - 1)),
  });
}

function statMeters(stats) {
  return Object.entries(STAT_LABELS)
    .map(
      ([key, label]) => `
      <div class="stat stat-${key}">
        <span class="stat-label">${label}</span>
        <span class="meter"><i style="--v:${stats[key] / 5}"></i></span>
        <span class="stat-num">${stats[key]}</span>
      </div>`,
    )
    .join('');
}

// 図鑑で「まだ持っていない」ものは、黒いシルエットにする
function drawSilhouette(canvas, def) {
  drawEraserPreview(canvas, def);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = '#5b5147';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// とくせいの説明（とくせいがない消しゴムは何も出さない）
// レア度のしるし（ノーマルは何も出さない）と、光るわくのクラス
function rarityTag(def) {
  const r = def.rarity || 'normal';
  return r === 'normal' ? '' : `<div class="rarity-tag r-${r}">${ERASER_RARITY[r].label}</div>`;
}
const rarityClass = (def) => `r-${def.rarity || 'normal'}`;

function traitLine(def) {
  const t = def.trait;
  return t ? `<div class="trait"><b>✨ ${t.name}</b> ${t.desc}</div>` : '';
}

function showEraserSelect({ title, selectedId, goLabel, onPick, onBack }) {
  let selected = selectedId;
  // 持っている消しゴム・文房具だけ出す（持っていないものは図鑑で見られる）
  const list = collection.ownedErasers();
  const lockedCount = REGULAR_ERASERS.filter((e) => !collection.owns(e.id)).length;
  const el = screen(
    `<h2 class="head">${title}</h2>
     <p class="note tip">👆 2回タップで すぐ けってい！</p>
     <div class="choices eraser-choices">
       ${list
         .map(
           (e) => `
         <button class="choice eraser-choice ${rarityClass(e)} ${e.id === selected ? 'selected' : ''}" data-id="${e.id}">
           ${rarityTag(e)}
           ${e.gacha ? '<div class="badge gacha">ガチャ</div>' : e.kind === 'chara' ? '<div class="badge chara">キャラ</div>' : ''}
           <canvas class="eraser-thumb"></canvas>
           <div class="choice-name">${e.name}</div>
           <div class="choice-desc">${e.desc}</div>
           ${traitLine(e)}
           <div class="stats">${statMeters(e.stats)}</div>
         </button>`,
         )
         .join('')}
     </div>
     <p class="note">消しゴム ${collection.ownedErasers().length} / ${ERASERS.length} こ あつめた${
       lockedCount ? `　🔒 あと${lockedCount}こは CPUにかつと 手に入るよ（ずかんで見られる）` : ''
     }</p>
     <div class="row">
       <button class="btn ghost" data-act="back">もどる</button>
       <button class="btn big primary" data-act="go">${goLabel}</button>
     </div>`,
  );
  const cards = [...el.querySelectorAll('.eraser-choice')];
  whenFonts(() =>
    cards.forEach((c) => {
      const def = findEraser(c.dataset.id);
      if (c.classList.contains('locked')) drawSilhouette(c.querySelector('canvas'), def);
      else drawEraserPreview(c.querySelector('canvas'), def);
    }),
  );
  // メーターがのびるアニメーション
  requestAnimationFrame(() => el.classList.add('meters-in'));
  const choosable = cards.filter((c) => !c.classList.contains('locked'));
  // 同じ消しゴムを すばやく2回タップしたら、そのまま たたかう（iPad でも動くように自分で数える）
  let lastTap = { id: null, at: 0 };
  choosable.forEach((c) => {
    c.onclick = () => {
      const now = performance.now();
      if (lastTap.id === c.dataset.id && now - lastTap.at < 450) {
        onPick(c.dataset.id);
        return;
      }
      lastTap = { id: c.dataset.id, at: now };
      selected = c.dataset.id;
      choosable.forEach((x) => x.classList.toggle('selected', x === c));
    };
  });
  el.querySelector('[data-act=back]').onclick = onBack;
  el.querySelector('[data-act=go]').onclick = () => onPick(selected);
}

// ---------- 5. カード配布 ----------
function showCardDeal(basePlayers) {
  const players = basePlayers.map((p) => ({ ...p, card: drawRandomCard() }));
  // ひとが はじめて手に入れたカードには NEW をつける（図鑑に入れる前に調べる）
  // CPU のカードは NEW にならず、図鑑にも入らない
  const isNew = players.map((p) => p.type === 'human' && !collection.hasSeenCard(p.card.id));
  collection.markCardsSeen(players.filter((p) => p.type === 'human').map((p) => p.card.id));
  const cpu = players.find((p) => p.type === 'cpu');
  // CPU モードでは、CPU のカードは「使うまで ないしょ」（裏のまま。中身は画面に出さない）
  const secret = players.map((p) => setup.mode === 'cpu' && p.type === 'cpu');
  const streakHead =
    setup.mode === 'cpu' && streak
      ? `<div class="streak-head">
           <span class="streak-round">🔥 ${streak.count + 1}戦目</span>
           <div class="vs">
             <div class="vs-side me">
               <canvas class="vs-eraser" data-id="${players[0].eraser.id}"></canvas>
               <div class="vs-name">あなた<br><b>${players[0].eraser.name}</b></div>
             </div>
             <div class="vs-mark">VS</div>
             <div class="vs-side cpu ${rarityClass(cpu.eraser)}">
               ${rarityTag(cpu.eraser)}
               <canvas class="vs-eraser" data-id="${cpu.eraser.id}"></canvas>
               <div class="vs-name">あいて<br><b>${cpu.eraser.name}</b></div>
             </div>
           </div>
           ${cpu.eraser.trait ? `<div class="trait vs-trait"><b>✨ ${cpu.eraser.trait.name}</b> ${cpu.eraser.trait.desc}</div>` : ''}
           ${collection.owns(cpu.eraser.id) ? '' : '<small class="vs-get">かつと この消しゴムが 手に入る！</small>'}
         </div>`
      : '';
  const el = screen(
    `${streakHead}
     <h2 class="head">能力カードを くばるよ</h2>
     <p class="deal-note">1しあいに1回、自分のばんの はじめに つかえる</p>
     <div class="deal n${players.length}">
       ${players
         .map(
           (p, i) => `
         <div class="deal-slot" style="--delay:${i * 0.15}s">
           <div class="deal-name" style="background:${p.color}">${esc(p.name)}</div>
           ${
             secret[i]
               ? `<div class="flip secret"><div class="card-back"><span>?</span></div></div>
                  <div class="secret-note">つかうまで ないしょ</div>`
               : flipCardHTML(p.card, '', { isNew: isNew[i] })
           }
         </div>`,
         )
         .join('')}
     </div>
     <button class="btn big primary hidden" data-act="go">たたかう！</button>`,
    'deal-screen',
  );
  // めくるのは、ないしょではないカードだけ
  const shown = players.map((p, i) => i).filter((i) => !secret[i]);
  // VS の消しゴムの絵（向かいあうように、すこし反対にかたむける）
  whenFonts(() =>
    el.querySelectorAll('.vs-eraser').forEach((c, k) => drawEraserPreview(c, findEraser(c.dataset.id), k ? 0.18 : -0.18)),
  );
  const flips = [...el.querySelectorAll('.flip:not(.secret)')];
  const go = el.querySelector('[data-act=go]');
  const timers = [];
  const gap = players.length > 2 ? 650 : 900;
  const openCard = (k) => {
    const f = flips[k];
    const i = shown[k];
    if (f.classList.contains('open')) return;
    f.classList.add('open');
    sfx.flip();
    const r = players[i].card.rarity;
    if (r !== 'normal') setTimeout(() => sfx.rare(), 350);
    if (r === 'superrare') setTimeout(() => sfx.rare(), 750); // スーパーレアは2回キラキラ
    if (isNew[i]) setTimeout(() => sfx.card(), 450);
    if (flips.every((x) => x.classList.contains('open'))) go.classList.remove('hidden');
  };
  flips.forEach((f, k) => {
    f.addEventListener('click', () => openCard(k));
    timers.push(setTimeout(() => openCard(k), 900 + k * gap));
  });
  go.onclick = () => {
    timers.forEach(clearTimeout);
    startBattle(players);
  };
}

// ---------- 6. 対戦 ----------
function startBattle(players) {
  lastPlayers = players;
  collection.markSeen(players.map((p) => p.eraser.id)); // 図鑑：出会った消しゴム
  const el = screen('', 'battle-screen');
  battle = createBattle(el, {
    desk: findDesk(setup.deskId),
    players,
    label: setup.mode === 'cpu' && streak ? `🔥${streak.count + 1}戦目` : '',
    hideCpuCards: setup.mode === 'cpu', // CPU のカードは使うまで ないしょ
    onEnd: showResult,
    onQuit: showTitle,
  });
}

// ---------- 7. 結果 ----------
function confetti(el) {
  const colors = ['#ff6b4a', '#3b82f6', '#22c55e', '#facc15', '#a855f7', '#f472b6'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 0.8}s`;
    s.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    s.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    box.appendChild(s);
  }
  el.appendChild(box);
}

function showResult(result, players) {
  const w = result.winner;
  const vsCpu = setup.mode === 'cpu';
  let headline;
  let sub;
  let cls;
  let color = '';
  if (w == null) {
    headline = 'ひきわけ！';
    sub = 'みんな落ちちゃった';
    cls = 'draw';
  } else if (vsCpu) {
    const human = players[w].type === 'human';
    headline = human ? 'かち！' : 'まけ…';
    sub = human ? `${players[w].eraser.name}で勝った！` : `${players[w].name}の${players[w].eraser.name}が勝った`;
    cls = human ? 'win' : 'lose';
  } else {
    headline = `${esc(players[w].name)}の<br>かち！`;
    sub = `${players[w].eraser.name}で さいごまで のこった！`;
    cls = 'win named';
    color = players[w].color;
  }
  const ranking =
    !vsCpu && w != null && players.length > 2
      ? `<ol class="ranking">
          ${result.ranking
            .map(
              (pi, r) => `
            <li style="--c:${players[pi].color}">
              <span class="rank">${r + 1}位</span>
              <span class="rname">${esc(players[pi].name)}</span>
              <span class="reraser">${players[pi].eraser.name}</span>
            </li>`,
            )
            .join('')}
         </ol>`
      : '';
  // 図鑑のごほうび：ひとが CPU にかったら、CPU の消しゴムが手に入る＋チケットのチャンス
  const cpus = players.filter((p) => p.type === 'cpu');
  let reward = null;
  if (w != null && players[w].type === 'human' && cpus.length) {
    reward = collection.recordCpuWin(cpus.map((p) => p.eraser.id));
  }
  const rewardHTML = !reward
    ? ''
    : `<div class="rewards">
        ${reward.unlocked
          .map(
            (e) => `
          <div class="reward new-eraser ${rarityClass(e)}">
            <canvas class="reward-eraser" data-id="${e.id}"></canvas>
            <div><b class="new">NEW!</b> ${rarityTag(e)} <b>${e.name}</b> が 使えるようになった！</div>
          </div>`,
          )
          .join('')}
        ${
          reward.ticket
            ? `<div class="reward ticket"><span class="big-ticket">🎫</span><div><b>ガチャチケット ゲット！</b><br>もっているチケット：${collection.tickets()}まい</div></div>`
            : collection.gachaLeft() > collection.tickets()
              ? `<div class="reward hint-ticket">🎫 あと <b>${collection.winsToPity()}</b> かいかつと チケットかくてい！</div>`
              : ''
        }
      </div>`;
  // CPU 連勝チャレンジ：勝ったら つぎの相手へ、負けたら記録が止まる
  let streakHTML = '';
  let buttons = `
       <button class="btn big primary" data-act="again">もう一回</button>
       <button class="btn ghost" data-act="title">タイトルへ</button>`;
  const humanWon = w != null && players[w].type === 'human';
  if (vsCpu && streak) {
    if (humanWon) {
      streak.count++;
      if (collection.recordStreak(streak.count)) streak.newRecord = true;
      streakHTML = `
        <div class="streak-box">
          <div class="streak-count">🔥 ${streak.count}れんしょう！</div>
          <div class="streak-best">${streak.newRecord ? '<span class="new-record">ベスト更新中！</span>' : `ベスト ${collection.bestStreak()}れんしょう`}</div>
        </div>`;
      buttons = `
       <button class="btn big primary" data-act="next">つぎの相手へ →</button>
       <button class="btn ghost" data-act="title">ここでおわる</button>`;
    } else {
      const n = streak.count;
      streakHTML = `
        <div class="streak-box">
          <div class="streak-count">${n ? `${n}れんしょうで ストップ` : 'れんしょう ならず…'}</div>
          <div class="streak-best">${streak.newRecord ? `<span class="new-record">ベスト記録！ ${n}れんしょう</span>` : `ベスト ${collection.bestStreak()}れんしょう`}</div>
        </div>`;
      buttons = `
       <button class="btn big primary" data-act="retry">もういちど チャレンジ</button>
       <button class="btn" data-act="change">消しゴムをかえる</button>
       <button class="btn ghost" data-act="title">タイトルへ</button>`;
    }
  }

  const el = screen(
    `<div class="result ${cls}">
       <div class="result-title" ${color ? `style="color:${color}"` : ''}>${headline}</div>
       ${w != null ? '<canvas class="result-eraser"></canvas>' : ''}
       <p class="result-sub">${sub}</p>
       ${streakHTML}
       ${rewardHTML}
       ${ranking}
       <div class="row">${buttons}</div>
     </div>`,
  );
  if (w != null && players[w].type === 'human') confetti(el);
  if (w != null) whenFonts(() => drawEraserPreview(el.querySelector('.result-eraser'), players[w].eraser));
  if (reward) {
    whenFonts(() =>
      el.querySelectorAll('.reward-eraser').forEach((c) => drawEraserPreview(c, findEraser(c.dataset.id))),
    );
    if (reward.unlocked.length || reward.ticket) setTimeout(() => sfx.rare(), 900);
  }
  // もう一回：同じ人・同じ消しゴムで、カードは配りなおし
  const me = players.find((p) => p.type === 'human')?.eraser;
  const on = (act, fn) => el.querySelector(`[data-act=${act}]`)?.addEventListener('click', fn);
  on('again', () => showCardDeal(lastPlayers));
  on('next', () => nextStreakBattle(me)); // 連勝チャレンジ：つぎの相手（毎回ちがう消しゴム）
  on('retry', () => startStreak(me)); // 0 からもういちど
  on('change', () => pickErasers(makePlayers()));
  on('title', showTitle);
}

// ---------- 図鑑 ----------
// 画面の上に重ねる小さなまど
function openModal(el, html) {
  const ov = document.createElement('div');
  ov.className = 'overlay fixed show';
  ov.innerHTML = html;
  el.appendChild(ov);
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-act=close]')) ov.remove();
  });
  return ov;
}

function eraserDetail(el, def) {
  const ov = openModal(
    el,
    `<div class="modal detail ${rarityClass(def)}">
       ${rarityTag(def)}
       ${def.gacha ? '<div class="badge gacha static">ガチャ</div>' : ''}
       <canvas class="detail-eraser"></canvas>
       <div class="detail-name">${def.name}</div>
       <div class="detail-desc">${def.desc}</div>
       ${traitLine(def)}
       <div class="stats">${statMeters(def.stats)}</div>
       <button class="btn" data-act="close">とじる</button>
     </div>`,
  );
  ov.querySelector('.modal').classList.add('meters-in');
  whenFonts(() => drawEraserPreview(ov.querySelector('canvas'), def));
}

function showZukan(tab = 'eraser') {
  const TABS = [
    { id: 'eraser', label: '消しゴム', items: REGULAR_ERASERS.filter((e) => e.kind !== 'chara') },
    { id: 'chara', label: 'キャラ', items: REGULAR_ERASERS.filter((e) => e.kind === 'chara') },
    { id: 'gacha', label: '文房具', items: GACHA_ERASERS },
    { id: 'card', label: 'カード', items: CARDS },
  ];
  const count = (t) =>
    t.id === 'card'
      ? t.items.filter((c) => collection.hasSeenCard(c.id)).length
      : t.items.filter((e) => collection.owns(e.id)).length;
  const cur = TABS.find((t) => t.id === tab);

  const cell = (item) => {
    if (cur.id === 'card') {
      return collection.hasSeenCard(item.id)
        ? `<button class="zukan-card" data-id="${item.id}">${cardHTML(item)}</button>`
        : `<div class="zukan-card unknown"><div class="card-back"><span>?</span></div></div>`;
    }
    const own = collection.owns(item.id);
    const seen = collection.hasSeen(item.id);
    const how = item.gacha ? 'ガチャで手に入る' : 'CPUで たおすと手に入る';
    return `
      <button class="zukan-cell ${own ? 'own ' + rarityClass(item) : 'locked'}" data-id="${item.id}" ${own ? '' : 'disabled'}>
        ${rarityTag(item)}
        <canvas></canvas>
        <div class="zukan-name">${own || seen ? item.name : '？？？'}</div>
        ${own ? '' : `<div class="zukan-how">${how}</div>`}
      </button>`;
  };

  let note = 'CPUが使っている消しゴムを たおすと、自分も使えるようになるよ';
  if (cur.id === 'chara') note = 'キャラ消しゴムも、CPUが使っているのを たおすと手に入るよ';
  if (cur.id === 'gacha') note = `🎫 チケット ${collection.tickets()}まい。CPUにかつと もらえることがあるよ`;
  if (cur.id === 'card') note = '対戦で くばられたカードが うまっていくよ';

  const el = screen(
    `<h2 class="head">📖 ずかん</h2>
     <div class="tabs">
       ${TABS.map(
         (t) => `<button class="tab ${t.id === tab ? 'on' : ''}" data-tab="${t.id}">${t.label}
           <small>${count(t)}/${t.items.length}</small></button>`,
       ).join('')}
     </div>
     <div class="zukan-grid ${cur.id === 'card' ? 'cards' : ''}">${cur.items.map(cell).join('')}</div>
     <p class="note">${note}</p>
     <div class="row">
       <button class="btn ghost" data-act="back">もどる</button>
       ${cur.id === 'gacha' ? '<button class="btn primary" data-act="gacha">🎰 ガチャへ</button>' : ''}
     </div>
     <button class="reset-link" data-act="reset">ずかんのデータを けす</button>`,
    'zukan-screen',
  );

  el.querySelectorAll('.tab').forEach((b) => (b.onclick = () => showZukan(b.dataset.tab)));
  if (cur.id !== 'card') {
    const cells = [...el.querySelectorAll('.zukan-cell')];
    whenFonts(() =>
      cells.forEach((c) => {
        const def = findEraser(c.dataset.id);
        const cv = c.querySelector('canvas');
        if (c.classList.contains('own')) drawEraserPreview(cv, def);
        else drawSilhouette(cv, def);
      }),
    );
    cells.forEach((c) => {
      if (c.classList.contains('own')) c.onclick = () => eraserDetail(el, findEraser(c.dataset.id));
    });
  } else {
    el.querySelectorAll('button.zukan-card').forEach((b) => {
      b.onclick = () => {
        const def = CARDS.find((c) => c.id === b.dataset.id);
        openModal(el, `<div class="modal">${cardHTML(def, 'big')}<button class="btn" data-act="close">とじる</button></div>`);
      };
    });
  }
  el.querySelector('[data-act=back]').onclick = showTitle;
  el.querySelector('[data-act=gacha]')?.addEventListener('click', showGacha);

  // まちがえて消さないように2回押し
  const reset = el.querySelector('[data-act=reset]');
  let armed = false;
  reset.onclick = () => {
    if (!armed) {
      armed = true;
      reset.textContent = 'ほんとうに消す？ もう一回押すと ぜんぶ はじめからになります';
      reset.classList.add('armed');
      setTimeout(() => {
        armed = false;
        reset.textContent = 'ずかんのデータを けす';
        reset.classList.remove('armed');
      }, 4000);
      return;
    }
    collection.reset();
    showZukan(tab);
  };
}

// ---------- ガチャ ----------
const CAPSULE_COLORS = ['#ff6b6b', '#ffd166', '#4fc3f7', '#81c784', '#ba68c8', '#ff8a65'];

function showGacha() {
  const tickets = collection.tickets();
  const left = collection.gachaLeft();
  const canPull = tickets > 0 && left > 0;
  const capsules = Array.from({ length: left }, (_, i) => {
    // 下からつみあがるように、少しずつずらして並べる
    const row = Math.floor(i / 4);
    const x = 10 + (i % 4) * 20 + (row % 2) * 9 + ((i * 7) % 5);
    const y = 68 - row * 20 + ((i * 5) % 6);
    return `<span class="capsule" style="left:${x}%;top:${y}%;--c:${CAPSULE_COLORS[i % CAPSULE_COLORS.length]}"></span>`;
  }).join('');
  let msg = 'チケットが ないよ。CPUと たたかおう！';
  if (canPull) msg = 'ハンドルを タップして まわそう！';
  if (left === 0) msg = 'ぜんぶ あつめた！すごい！';

  const el = screen(
    `<h2 class="head">🎰 ぶんぼうぐガチャ</h2>
     <p class="note">CPUにかつと チケットがもらえることがあるよ（${GAME.collection.pityWins}かい かつまでに かならず1まい）<br>
       おなじものは でないよ。お金は いらないよ</p>
     <div class="gacha-machine">
       <div class="gacha-dome">${capsules || '<span class="gacha-empty">からっぽ！</span>'}</div>
       <div class="gacha-body">
         <div class="gacha-label">ぶんぼうぐ</div>
         <button class="gacha-handle" data-act="pull" ${canPull ? '' : 'disabled'} aria-label="まわす"><span></span></button>
         <div class="gacha-out"></div>
       </div>
     </div>
     <div class="gacha-info">
       <span>🎫 チケット <b>${tickets}</b>まい</span>
       <span>のこり <b>${left}</b> / ${GACHA_ERASERS.length}</span>
     </div>
     <p class="note gacha-msg">${msg}</p>
     <div class="row">
       <button class="btn ghost" data-act="back">もどる</button>
       <button class="btn" data-act="zukan">📖 ずかん</button>
     </div>`,
    'gacha-screen',
  );
  el.querySelector('[data-act=back]').onclick = showTitle;
  el.querySelector('[data-act=zukan]').onclick = () => showZukan('gacha');

  const handle = el.querySelector('[data-act=pull]');
  handle.onclick = () => {
    const def = collection.pullGacha();
    if (!def) return;
    handle.disabled = true;
    handle.classList.add('turn');
    sfx.whoosh();
    setTimeout(() => sfx.hit(4), 450);
    // カプセルが出てくる
    setTimeout(() => {
      const out = el.querySelector('.gacha-out');
      const color = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
      out.innerHTML = `<button class="capsule big drop" style="--c:${color}" aria-label="あける"></button>`;
      sfx.hit(8);
      el.querySelector('.gacha-msg').textContent = 'カプセルを タップして あけよう！';
      const cap = out.querySelector('.capsule');
      let opened = false;
      const open = () => {
        if (opened) return;
        opened = true;
        cap.classList.add('open');
        sfx.flip();
        setTimeout(() => reveal(def), 350);
      };
      cap.onclick = open;
      setTimeout(open, 2500); // さわらなくても開く
    }, 900);
  };

  function reveal(def) {
    sfx.rare();
    setTimeout(() => sfx.rare(), 400);
    const ov = openModal(
      el,
      `<div class="modal detail reveal ${rarityClass(def)}">
         ${rarityTag(def)}
         <div class="reveal-new">NEW!</div>
         <canvas class="detail-eraser"></canvas>
         <div class="detail-name">${def.name}</div>
         <div class="detail-desc">${def.desc}</div>
         ${traitLine(def)}
         <div class="stats">${statMeters(def.stats)}</div>
         <p class="note">対戦で 使えるようになったよ！</p>
         <button class="btn primary" data-act="close">やったね！</button>
       </div>`,
    );
    ov.querySelector('.modal').classList.add('meters-in');
    whenFonts(() => drawEraserPreview(ov.querySelector('canvas'), def));
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-act=close]')) showGacha();
    });
  }
}

// オンラインの画面（onlineScreens.js）に、ここの部品をわたす
const online = setupOnline({
  screen,
  whenFonts,
  showTitle,
  showModeSelect,
  showEraserSelect,
  setBattle: (b) => {
    battle = b;
  },
});

showTitle();
