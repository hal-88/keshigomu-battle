// 画面の流れ：タイトル → モード →（1台でみんなで：だれが遊ぶ？）→ 机 → 消しゴム → カード配布 → 対戦 → 結果

import './style.css';
import { DESKS, findDesk } from './config/desks.js';
import { ERASERS, REGULAR_ERASERS, GACHA_ERASERS, STATIONERY_ERASERS, SPECIAL_ERASERS, KYUSHOKU_ERASERS, MUKASHI_ERASERS, SEKAI_ERASERS, CHAMPION_ERASERS, STAT_LABELS, ERASER_RARITY, findEraser, pickByRarity } from './config/erasers.js';
import { CARDS, drawRandomCard } from './config/cards.js';
import { collection, isMukashiSeason, mukashiUntil, gachaModes } from './progress/collection.js';
import { clipsHTML, bindClips } from './replay/replayUI.js';
import { countryLine } from './ui/flags.js';
import { cardHTML } from './ui/cardView.js';
import { GAME } from './config/game.js';
import { createBattle } from './battle.js';
import { drawEraser, drawEraserPreview } from './render/drawEraser.js';
import { flipCardHTML } from './ui/cardView.js';
import { sfx, unlockAudio, isMuted, setMuted, setVolume, resetSound } from './audio/sfx.js';
import { setupOnline } from './onlineScreens.js';
import { ONLINE } from './config/online.js';
import { rewardsHTML } from './ui/rewardView.js';
import { setupPwa, isInstalled, showInstallGuide } from './ui/installApp.js';
import { watchFit, stopFit } from './ui/fitScreen.js';
import { makeBracket, setWinner, readyMatches, matchOf, isOut, champion, roundName } from './tournament/bracket.js';
import { runAutoMatchAsync } from './tournament/autoMatch.js';
import { bracketHTML } from './ui/bracketView.js';
import { engraveHTML, winBadgeHTML, plateHTML, myPlayerName } from './ui/engraveView.js';

setupPwa(); // アプリとしてホーム画面に置けるように（オフラインでも動く）

const MODES = [
  { id: 'cpu', name: 'CPU 連勝チャレンジ', desc: '次々 違う消しゴムのCPUと1対1。相手を倒して 消しゴムを ゲットしよう！ 何連勝できるかな？', enabled: true },
  { id: 'tournament', name: '🏆 トーナメント', desc: 'CPUと 16人で 勝ち抜き戦。優勝すると 限定の消しゴムが もらえる！（相手の消しゴムは もらえないよ）', enabled: true },
  { id: 'local', name: '1台でみんなで', desc: '2〜4人で交代で（CPUも混ぜられる）', enabled: true },
  { id: 'online', name: 'オンライン', desc: '合言葉（数字）で 友だちと対戦', enabled: true },
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

// ---- 設定（効果音）----
// 弾く・ぶつかる・落ちる・勝ち の音を、それぞれ 6種類から えらべる（src/sfx.js の KeshiSfx）
function showSettings() {
  const K = window.KeshiSfx;
  const st = K.getSettings();
  const el = screen(
    `<h2 class="head">⚙️ 設定</h2>
     <h3 class="set-head">🔊 効果音</h3>
     <p class="note">音を タップすると 試し聞き。えらんだ音が 対戦で 鳴るよ</p>
     <div class="sfx-cats fit-scroll">
       ${K.CATS.map(
         (c) => `
         <div class="sfx-cat">
           <div class="sfx-cat-label">${c.label}</div>
           <div class="sfx-opts">
             ${c.opts
               .map(
                 (o) => `<button class="sfx-opt ${st.choice[c.key] === o.id ? 'on' : ''}" data-cat="${c.key}" data-id="${o.id}">
                   <b>${o.name}</b><small>${o.word}</small></button>`,
               )
               .join('')}
           </div>
         </div>`,
       ).join('')}
     </div>
     <div class="sfx-vol">
       <button class="btn small" data-act="mute">${isMuted() ? '🔇 音なし' : '🔊 音あり'}</button>
       <label>音量 <input type="range" min="0" max="100" step="5" value="${Math.round(st.volume * 100)}" data-act="vol"></label>
     </div>
     <div class="row">
       <button class="btn ghost" data-act="back">戻る</button>
       <button class="btn" data-act="reset">はじめにもどす</button>
     </div>`,
    'settings-screen',
  );
  el.querySelectorAll('.sfx-opt').forEach((b) => {
    b.onclick = () => {
      const { cat, id } = b.dataset;
      K.preview(cat, id);
      K.setChoice(cat, id);
      el.querySelectorAll(`.sfx-opt[data-cat="${cat}"]`).forEach((x) => x.classList.toggle('on', x === b));
    };
  });
  const vol = el.querySelector('[data-act=vol]');
  vol.oninput = () => setVolume(Number(vol.value) / 100);
  vol.onchange = () => K.preview('hit', K.getSettings().choice.hit); // はなしたら 今の音量で 試し聞き
  el.querySelector('[data-act=mute]').onclick = (ev) => {
    setMuted(!isMuted());
    ev.currentTarget.textContent = isMuted() ? '🔇 音なし' : '🔊 音あり';
  };
  el.querySelector('[data-act=reset]').onclick = () => {
    resetSound();
    sfx.tap();
    showSettings();
  };
  el.querySelector('[data-act=back]').onclick = showTitle;
}

function screen(html, cls = '') {
  battle?.destroy();
  battle = null;
  // 中身は .screen-in に入れる（画面の大きさに 合わせて 小さくするため）
  app.innerHTML = `<div class="screen ${cls}"><div class="screen-in">${html}</div></div>`;
  const el = app.firstElementChild;
  if (html) watchFit(el);
  else stopFit(); // 対戦画面（中身なし）は 自分で 合わせる
  return el;
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
       <p class="subtitle">弾いて、ぶつけて、机から落とせ！</p>
       ${collection.tournamentWins() ? `<div class="title-trophy">🏆 優勝 ${collection.tournamentWins()}回</div>` : ''}
       <button class="btn big primary" data-act="start">始める</button>
       <div class="row title-sub">
         <button class="btn" data-act="zukan">📖 図鑑 <small>${collection.ownedErasers().length}/${ERASERS.length}</small></button>
         <button class="btn" data-act="gacha">${isMukashiSeason() ? '🎍' : '🎰'} ガチャ ${
           collection.tickets() ? `<span class="ticket-badge">🎫${collection.tickets()}</span>` : ''
         }</button>
       </div>
       <button class="install-link" data-act="settings">⚙️ 設定（効果音）</button>
       ${isInstalled() ? '' : '<button class="install-link" data-act="install">📲 アプリにする（ホーム画面に置く）</button>'}
     </div>`,
    'title-screen',
  );
  el.querySelector('[data-act=settings]').onclick = showSettings;
  el.querySelector('[data-act=install]')?.addEventListener('click', () => showInstallGuide(el));
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
  el.querySelector('[data-act=gacha]').onclick = () => showGacha();
}

// ---------- 2. モード ----------
function showModeSelect() {
  const el = screen(
    `<h2 class="head">遊び方を 選ぼう</h2>
     <div class="choices">
       ${MODES.map(
         (m) => `
         <button class="choice ${m.enabled ? '' : 'disabled'}" data-id="${m.id}" ${m.enabled ? '' : 'disabled'}>
           <div class="choice-name">${m.name}</div>
           <div class="choice-desc">${m.desc}</div>
           ${m.id === 'cpu' && collection.bestStreak() ? `<div class="choice-desc best">🏆 ベスト ${collection.bestStreak()}連勝</div>` : ''}
           ${m.id === 'tournament' && collection.tournamentWins() ? `<div class="choice-desc best">🏆 優勝 ${collection.tournamentWins()}回</div>` : ''}
           ${m.enabled ? '' : '<div class="badge">準備中</div>'}
         </button>`,
       ).join('')}
     </div>
     <button class="btn ghost" data-act="back">戻る</button>`,
  );
  el.querySelectorAll('.choice:not(.disabled)').forEach((b) => {
    b.onclick = () => {
      setup.mode = b.dataset.id;
      if (setup.mode === 'local') showPlayerSetup();
      else if (setup.mode === 'online') online.showMenu();
      else if (setup.mode === 'tournament') pickTournamentEraser();
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
    `<h2 class="head">だれが 遊ぶ？</h2>
     <div class="count-row">
       <span>人数</span>
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
             aria-label="${i + 1}番目の名前" autocomplete="off" enterkeyhint="done">
           <div class="seg">
             <button class="${s.type === 'human' ? 'on' : ''}" data-i="${i}" data-type="human">人</button>
             <button class="${s.type === 'cpu' ? 'on' : ''}" data-i="${i}" data-type="cpu">CPU</button>
           </div>
         </div>`,
         )
         .join('')}
     </div>
     <p class="note">名前は ニックネームで（${GAME.nameMaxLength}文字まで）。順番は 上から</p>
     <div class="row">
       <button class="btn ghost" data-act="back">戻る</button>
       <button class="btn big primary" data-act="next">次へ</button>
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
    `<h2 class="head">机を 選ぼう</h2>
     <div class="choices desk-choices fit-scroll">
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
     <button class="btn ghost" data-act="back">戻る</button>`,
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
    title: setup.mode === 'local' ? `<span style="color:${p.color}">${esc(p.name)}</span>の 消しゴムを 選ぼう` : '消しゴムを 選ぼう',
    selectedId: collection.owns(setup.eraserIds[i]) ? setup.eraserIds[i] : collection.ownedErasers()[0].id,
    goLabel: last ? 'これで戦う！' : '次の人へ →',
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
  // 世界の遊びは「○○で 生まれた 遊び」と 国旗も
  return `${countryLine(def)}${t ? `<div class="trait"><b>✨ ${t.name}</b> ${t.desc}</div>` : ''}`;
}

// 消しゴムを 選ぶ 画面の シリーズ（図鑑と 同じ わけかた。持っている ものが ある シリーズだけ）
function pickerTabs() {
  const own = (list) => list.filter((e) => collection.owns(e.id));
  const favs = collection.favorites().map(findEraser).filter((e) => e && collection.owns(e.id));
  return [
    { id: 'fav', label: '⭐お気に入り', items: favs },
    { id: 'eraser', label: '消しゴム', items: own(REGULAR_ERASERS.filter((e) => e.kind !== 'chara')) },
    { id: 'chara', label: 'キャラ', items: own(REGULAR_ERASERS.filter((e) => e.kind === 'chara')) },
    { id: 'special', label: '特別', items: own(SPECIAL_ERASERS) },
    { id: 'kyushoku', label: '🍱給食', items: own(KYUSHOKU_ERASERS) },
    { id: 'mukashi', label: '🎍昔あそび', items: own(MUKASHI_ERASERS) },
    { id: 'sekai', label: '🌏世界', items: own(SEKAI_ERASERS) },
    { id: 'gacha', label: '文房具', items: own(STATIONERY_ERASERS) },
    { id: 'champion', label: '🏆優勝', items: own(CHAMPION_ERASERS) },
  ].filter((t) => t.items.length);
}

/** シリーズの タブ（◀ ▶ つき）。いまの タブが 見えるように よこに スクロール */
function tabNavHTML(tabs, cur, extra = () => '') {
  const i = tabs.findIndex((t) => t.id === cur);
  return `<div class="tab-nav">
      <button class="tab-arrow" data-go="-1" ${i > 0 ? '' : 'disabled'} aria-label="前の シリーズ">◀</button>
      <div class="tabs">${tabs
        .map((t) => `<button class="tab ${t.id === cur ? 'on' : ''}" data-tab="${t.id}">${t.label}${extra(t)}</button>`)
        .join('')}</div>
      <button class="tab-arrow" data-go="1" ${i < tabs.length - 1 ? '' : 'disabled'} aria-label="次の シリーズ">▶</button>
    </div>`;
}

/** タブ・◀ ▶・左右スワイプで シリーズを かえる。go(id, 向き) を よぶ */
function bindTabNav(el, tabs, cur, go) {
  const i = tabs.findIndex((t) => t.id === cur);
  const move = (d) => {
    const next = tabs[i + d];
    if (next) {
      sfx.tap();
      go(next.id, d);
    }
  };
  el.querySelectorAll('.tab-nav [data-go]').forEach((b) => (b.onclick = () => move(Number(b.dataset.go))));
  el.querySelectorAll('.tab-nav [data-tab]').forEach((b) => (b.onclick = () => b.dataset.tab !== cur && go(b.dataset.tab, tabs.findIndex((t) => t.id === b.dataset.tab) - i)));
  el.querySelector('.tab-nav .tab.on')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  // 一覧の上で 左右に スワイプ
  const area = el.querySelector('.fit-scroll') || el;
  let sx = null;
  let sy = 0;
  area.addEventListener('pointerdown', (e) => {
    sx = e.clientX;
    sy = e.clientY;
  });
  area.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      // スワイプの あとの タップで 消しゴムを えらばないように
      area.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
      move(dx < 0 ? 1 : -1);
    }
  });
  area.addEventListener('pointercancel', () => (sx = null));
}

function showEraserSelect(opts) {
  const { title, selectedId, goLabel, onPick, onBack } = opts;
  let selected = selectedId;
  // 持っている消しゴム・文房具だけ出す（持っていないものは図鑑で見られる）。シリーズごとに わける
  const tabs = pickerTabs();
  const tabOf = (id) => tabs.find((t) => t.id !== 'fav' && t.items.some((e) => e.id === id))?.id;
  let tab = opts.tab && tabs.some((t) => t.id === opts.tab) ? opts.tab : tabs[0]?.id === 'fav' ? 'fav' : tabOf(selected) || tabs[0]?.id;
  const list = tabs.find((t) => t.id === tab)?.items || [];
  const lockedCount = REGULAR_ERASERS.filter((e) => !collection.owns(e.id)).length;
  const el = screen(
    `<h2 class="head">${title}</h2>
     <p class="note tip">👆 2回タップで 決定　お気に入りは 下の ☆ で</p>
     ${tabNavHTML(tabs, tab, (t) => `<small>${t.items.length}</small>`)}
     <div class="choices eraser-choices fit-scroll ${opts.slide > 0 ? 'slide-l' : opts.slide < 0 ? 'slide-r' : ''}">
       ${list
         .map(
           (e) => `
         <button class="choice eraser-choice tile ${rarityClass(e)} ${e.id === selected ? 'selected' : ''} ${collection.isFavorite(e.id) ? 'fav' : ''}" data-id="${e.id}">
           ${collection.isFavorite(e.id) ? '<span class="fav-mark" aria-label="お気に入り">★</span>' : ''}
           ${winBadgeHTML(e.id)}
           <canvas class="eraser-thumb"></canvas>
           <div class="choice-name">${collection.isKira(e.id) ? '✨' : ''}${e.name}</div>
         </button>`,
         )
         .join('')}
     </div>
     <div class="pick-detail" data-el="detail"></div>
     <p class="note small-note">消しゴム ${collection.ownedErasers().length} / ${ERASERS.length} 個 集めた${
       lockedCount ? `　🔒 あと${lockedCount}個は CPUに勝つと 手に入るよ` : ''
     }</p>
     <div class="row">
       <button class="btn ghost" data-act="back">戻る</button>
       <span class="picked-name" data-el="picked">${selected && findEraser(selected) ? `いま：<b>${findEraser(selected).name}</b>` : ''}</span>
       <button class="btn big primary" data-act="go">${goLabel}</button>
     </div>`,
  );
  bindTabNav(el, tabs, tab, (id, d) => showEraserSelect({ ...opts, selectedId: selected, tab: id, slide: d }));
  // えらんだ 消しゴムの くわしい ところ（能力・メーター）
  const showDetail = () => {
    const def = findEraser(selected);
    const box = el.querySelector('[data-el=detail]');
    if (!def) {
      box.innerHTML = '';
      return;
    }
    const fav = collection.isFavorite(def.id);
    box.innerHTML = `<div class="pick-detail-top">
        <canvas class="pick-detail-pic"></canvas>
        <div class="pick-detail-head">${rarityTag(def)}<b>${collection.isKira(def.id) ? '✨' : ''}${def.name}</b><span>${def.desc}</span></div>
        <button class="pick-fav ${fav ? 'on' : ''}" data-act="fav">${fav ? '★ お気に入り' : '☆ お気に入りに する'}</button>
      </div>
      ${traitLine(def)}
      <div class="stats">${statMeters(def.stats)}</div>`;
    whenFonts(() => drawEraserPreview(box.querySelector('.pick-detail-pic'), def, -0.18, { kira: collection.isKira(def.id) }));
    // ☆：お気に入りに 入れる／はずす（タイルで まちがえて おさないように、ここだけに した）
    box.querySelector('[data-act=fav]').onclick = () => {
      const r = collection.toggleFavorite(def.id);
      if (!r.ok) {
        miniToast(el, r.reason);
        return;
      }
      sfx.tap();
      showEraserSelect({ ...opts, selectedId: selected, tab, slide: 0 }); // ならびかえて 出しなおす
    };
  };
  showDetail();
  const cards = [...el.querySelectorAll('.eraser-choice')];
  whenFonts(() =>
    cards.forEach((c) => {
      const def = findEraser(c.dataset.id);
      if (c.classList.contains('locked')) drawSilhouette(c.querySelector('canvas'), def);
      else drawEraserPreview(c.querySelector('canvas'), def, -0.18, { kira: collection.isKira(def.id) });
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
      el.querySelector('[data-el=picked]').innerHTML = `いま：<b>${findEraser(selected).name}</b>`;
      showDetail();
    };
  });
  el.querySelector('[data-act=back]').onclick = onBack;
  el.querySelector('[data-act=go]').onclick = () => onPick(selected);
}

/** 画面の下に 少しだけ出る おしらせ */
function miniToast(el, text) {
  el.querySelector('.mini-toast')?.remove();
  const t = document.createElement('div');
  t.className = 'mini-toast';
  t.textContent = text;
  el.appendChild(t);
  setTimeout(() => t.remove(), 2200);
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
  const vsCpuMode = setup.mode === 'cpu' || setup.mode === 'tournament';
  const secret = players.map((p) => vsCpuMode && p.type === 'cpu');
  const roundLabel =
    setup.mode === 'tournament' && tour?.current
      ? `🏆 ${roundName(tour.br.size, tour.current.r)}（机：${findDesk(setup.deskId).name}）`
      : setup.mode === 'cpu' && streak
        ? `🔥 ${streak.count + 1}戦目`
        : '';
  const streakHead =
    roundLabel && cpu
      ? `<div class="streak-head">
           <span class="streak-round">${roundLabel}</span>
           <div class="vs">
             <div class="vs-side me">
               <canvas class="vs-eraser" data-id="${players[0].eraser.id}"></canvas>
               <div class="vs-name">あなた<br><b>${players[0].eraser.name}</b></div>
             </div>
             <div class="vs-mark">VS</div>
             <div class="vs-side cpu ${rarityClass(cpu.eraser)}">
               ${rarityTag(cpu.eraser)}
               <canvas class="vs-eraser" data-id="${cpu.eraser.id}"></canvas>
               <div class="vs-name">相手<br><b>${cpu.eraser.name}</b></div>
             </div>
           </div>
           ${cpu.eraser.trait ? `<div class="trait vs-trait"><b>✨ ${cpu.eraser.trait.name}</b> ${cpu.eraser.trait.desc}</div>` : ''}
           ${collection.owns(cpu.eraser.id) || setup.mode === 'tournament' ? '' : '<small class="vs-get">勝つと この消しゴムが 手に入る！</small>'}
         </div>`
      : '';
  const el = screen(
    `${streakHead}
     <h2 class="head">能力カードを 配るよ</h2>
     <p class="deal-note">1試合に1回、自分の番の 初めに 使える</p>
     <div class="deal n${players.length}">
       ${players
         .map(
           (p, i) => `
         <div class="deal-slot" style="--delay:${i * 0.15}s">
           <div class="deal-name" style="background:${p.color}">${esc(p.name)}</div>
           ${
             secret[i]
               ? `<div class="flip secret"><div class="card-back"><span>?</span></div></div>
                  <div class="secret-note">使うまで 内緒</div>`
               : flipCardHTML(p.card, '', { isNew: isNew[i] })
           }
         </div>`,
         )
         .join('')}
     </div>
     <button class="btn big primary hidden" data-act="go">戦う！</button>`,
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
  // キラ（ガチャで 2回出た）の消しゴムは 対戦でも 光る（この端末の ひとだけ）
  for (const p of players) p.kira = p.type === 'human' && collection.isKira(p.eraser.id);
  lastPlayers = players;
  collection.markSeen(players.map((p) => p.eraser.id)); // 図鑑：出会った消しゴム
  const el = screen('', 'battle-screen');
  battle = createBattle(el, {
    desk: findDesk(setup.deskId),
    players,
    label:
      setup.mode === 'tournament' && tour?.current
        ? `🏆${roundName(tour.br.size, tour.current.r)}`
        : setup.mode === 'cpu' && streak
          ? `🔥${streak.count + 1}戦目`
          : '',
    hideCpuCards: setup.mode === 'cpu' || setup.mode === 'tournament', // CPU のカードは使うまで ないしょ
    firstTurn: Math.floor(Math.random() * players.length), // 先攻はルーレットで（結果はここで決める）
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
  const inTour = setup.mode === 'tournament' && tour?.current;
  const vsCpu = setup.mode === 'cpu' || inTour;
  const inStreak = setup.mode === 'cpu' && streak;
  let headline;
  let sub;
  let cls;
  let color = '';
  if (w == null) {
    headline = '引き分け！';
    sub = 'みんな落ちちゃった';
    cls = 'draw';
  } else if (vsCpu) {
    const human = players[w].type === 'human';
    headline = human ? '勝ち！' : '負け…';
    sub = human ? `${players[w].eraser.name}で勝った！` : `${players[w].name}の${players[w].eraser.name}が勝った`;
    cls = human ? 'win' : 'lose';
  } else {
    headline = `${esc(players[w].name)}の<br>勝ち！`;
    sub = `${players[w].eraser.name}で 最後まで 残った！`;
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
  // 図鑑のごほうび（CPU がいる試合だけ）
  //   CPU にかったら CPU の消しゴムが手に入る＋20%でチケット。勝っても負けても5戦ごとにチケット。
  //   れんしょうチャレンジは3連勝ごとにボーナスのチケット
  const cpus = players.filter((p) => p.type === 'cpu');
  const humanWon = w != null && players[w].type === 'human';
  let reward = null;
  if (cpus.length) {
    reward = collection.finishMatch({
      won: humanWon,
      cpuWin: humanWon,
      defeatedIds: inTour ? [] : cpus.map((p) => p.eraser.id), // トーナメントでは 相手の消しゴムは もらえない
      streak: inStreak && humanWon ? streak.count + 1 : 0,
    });
  }
  const rewardHTML = rewardsHTML(reward);
  // CPU 連勝チャレンジ：勝ったら つぎの相手へ、負けたら記録が止まる
  let streakHTML = '';
  let buttons = `
       <button class="btn big primary" data-act="again">もう一回</button>
       <button class="btn ghost" data-act="title">タイトルへ</button>`;
  if (inTour) {
    if (w == null) {
      // 引き分けは もう一度（同じ相手・同じ机）
      streakHTML = '<div class="streak-box"><div class="streak-count">引き分けなので もう一度！</div></div>';
      buttons = `<button class="btn big primary" data-act="again">もう一度 たたかう</button>`;
    } else {
      const { r, m } = tour.current;
      const match = tour.br.rounds[r][m];
      setWinner(tour.br, r, m, humanWon ? tour.me : match.a === tour.me ? match.b : match.a);
      tour.fresh = new Set([`${r}-${m}`]);
      tour.current = null;
      const final = r === tour.br.rounds.length - 1;
      streakHTML = `<div class="streak-box"><div class="streak-count">${
        humanWon ? (final ? '🏆 優勝！' : `${roundName(tour.br.size, r)} 突破！`) : `${roundName(tour.br.size, r)}で 敗退…`
      }</div></div>`;
      buttons = `<button class="btn big primary" data-act="bracket">${final && humanWon ? '🏆 表彰式へ' : 'トーナメント表へ →'}</button>`;
    }
  } else if (inStreak) {
    if (humanWon) {
      streak.count++;
      if (collection.recordStreak(streak.count)) streak.newRecord = true;
      streakHTML = `
        <div class="streak-box">
          <div class="streak-count">🔥 ${streak.count}連勝！</div>
          <div class="streak-best">${streak.newRecord ? '<span class="new-record">ベスト更新中！</span>' : `ベスト ${collection.bestStreak()}連勝`}</div>
        </div>`;
      buttons = `
       <button class="btn big primary" data-act="next">次の相手へ →</button>
       <button class="btn ghost" data-act="title">ここで終わる</button>`;
    } else {
      const n = streak.count;
      streakHTML = `
        <div class="streak-box">
          <div class="streak-count">${n ? `${n}連勝で ストップ` : '連勝 ならず…'}</div>
          <div class="streak-best">${streak.newRecord ? `<span class="new-record">ベスト記録！ ${n}連勝</span>` : `ベスト ${collection.bestStreak()}連勝`}</div>
        </div>`;
      buttons = `
       <button class="btn big primary" data-act="retry">もう一度 チャレンジ</button>
       <button class="btn" data-act="change">消しゴムを変える</button>
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
       ${clipsHTML(result.clips)}
       <div class="row">${buttons}</div>
     </div>`,
  );
  bindClips(el, result.clips); // 📹 名場面を 動画に
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
  on('bracket', () => (tour && champion(tour.br) != null ? showChampion() : showBracket()));
}

// ---------- 🏆 トーナメント（1人で 16人制。CPU 15人と 勝ち抜き戦） ----------
let tour = null; // { br, me, eraserId, current: {r, m}, fresh, rewarded, runId }

function pickTournamentEraser() {
  const owned = collection.ownedErasers();
  showEraserSelect({
    title: '🏆 トーナメントで 使う消しゴムを 選ぼう',
    selectedId: collection.owns(setup.eraserIds[0]) ? setup.eraserIds[0] : owned[0].id,
    goLabel: 'エントリー！',
    onPick: (id) => {
      setup.eraserIds[0] = id;
      startTournament(id);
    },
    onBack: showModeSelect,
  });
}

function startTournament(eraserId) {
  const used = [eraserId]; // CPU は 自分と ちがう消しゴム
  const br = makeBracket(
    [{ name: 'あなた', type: 'human', eraserId }],
    (k) => {
      const e = cpuPickEraser(used); // CPU は みんな ちがう消しゴム
      used.push(e.id);
      return { name: `CPU${k + 1}`, type: 'cpu', eraserId: e.id };
    },
    16, // 1人で遊ぶときは 16人制（CPU 15人）
  );
  tour = { br, me: br.entries.findIndex((x) => x.type === 'human'), eraserId, current: null, fresh: new Set(), rewarded: false, runId: 0 };
  showBracket();
}

function showBracket() {
  const { br, me } = tour;
  const runId = ++tour.runId;
  const mine = matchOf(br, me);
  const out = isOut(br, me);
  const champ = champion(br);
  // まだ終わっていない CPU どうしの試合（自分の つぎの試合より 前の回戦のもの。回戦は ぜんぶ 終わってから つぎへ）
  const pending = () => {
    const my = matchOf(br, me);
    return readyMatches(br).filter(({ r, match }) => match.a !== me && match.b !== me && (!my || r < my.r));
  };
  const waiting = pending().length > 0;

  const head = champ != null
    ? '🏆 優勝が 決まった！'
    : mine && !waiting
      ? `つぎは ${roundName(br.size, mine.r)}！`
      : out
        ? 'ざんねん… でも 最後まで 見よう'
        : 'ほかの試合を 待っているよ…';
  const el = screen(
    `<h2 class="head">🏆 トーナメント</h2>
     <p class="note">${head}</p>
     <div class="bracket-wrap">${bracketHTML(br, { me, fresh: tour.fresh, now: mine ? `${mine.r}-${mine.m}` : null })}</div>
     <div class="row bracket-buttons"></div>`,
    'bracket-screen',
  );
  whenFonts(() => el.querySelectorAll('.br-eraser').forEach((c) => drawEraserPreview(c, findEraser(c.dataset.id))));
  const row = el.querySelector('.bracket-buttons');
  const button = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.innerHTML = label;
    b.onclick = fn;
    row.appendChild(b);
  };

  if (champ != null) {
    button('🏆 表彰式へ', 'big primary', showChampion);
    return;
  }
  if (mine && !waiting) {
    button('やめる', 'ghost', showTitle);
    button(`${roundName(br.size, mine.r)}へ！`, 'big primary', () => playTournamentMatch(mine));
    return;
  }
  // 自分の試合がないあいだは、CPU どうしの試合を 1つずつ すすめる（負けたあとは ボタンで）
  const runOthers = async () => {
    row.innerHTML = '<span class="note">試合中…</span>';
    while (tour.runId === runId) {
      const next = pending()[0];
      if (!next) break;
      const { r, m, match } = next;
      const ea = br.entries[match.a];
      const eb = br.entries[match.b];
      const w = await runAutoMatchAsync(match.deskId, ea.eraserId, eb.eraserId);
      if (tour.runId !== runId) return; // 画面が かわった
      setWinner(br, r, m, w === 0 ? match.a : match.b);
      tour.fresh = new Set([`${r}-${m}`]);
      sfx.hit(4);
      await new Promise((res) => setTimeout(res, 550));
      if (tour.runId !== runId) return;
      showBracket(); // 表を かきなおして、つぎへ
      return;
    }
  };
  if (out && !tour.watchAll) {
    button('タイトルへ', 'ghost', showTitle);
    button('最後まで 見る', 'big primary', () => {
      tour.watchAll = true; // このあとは 最後まで つづけて すすめる
      runOthers();
    });
  } else {
    runOthers();
  }
}

function playTournamentMatch({ r, m, match }) {
  const { br, me } = tour;
  const oppIdx = match.a === me ? match.b : match.a;
  const opp = br.entries[oppIdx];
  tour.current = { r, m };
  tour.fresh = new Set();
  setup.mode = 'tournament';
  setup.deskId = match.deskId; // 机は 試合ごとに ランダム
  showCardDeal([
    { name: 'あなた', type: 'human', eraser: findEraser(tour.eraserId), color: GAME.playerColors[0] },
    { name: opp.name, type: 'cpu', level: 'normal', eraser: findEraser(opp.eraserId), color: GAME.playerColors[1] },
  ]);
}

function showChampion() {
  const { br, me } = tour;
  const c = champion(br);
  const winner = br.entries[c];
  const isMe = c === me;
  let reward = null;
  if (isMe && !tour.rewarded) {
    tour.rewarded = true;
    reward = collection.winTournament({ size: br.size, cup: 'CPU杯', name: myPlayerName(), usedEraserId: winner.eraserId });
  }
  const def = findEraser(winner.eraserId);
  const lastTrophy = isMe ? collection.engravings(winner.eraserId).find((t) => t.kind === 'win') : null;
  const el = screen(
    `<div class="result champion-result ${isMe ? 'win' : ''}">
       <div class="champ-trophy">🏆</div>
       <div class="result-title">${isMe ? '優勝！' : `優勝は ${esc(winner.name)}`}</div>
       <canvas class="result-eraser"></canvas>
       <p class="result-sub">${def.name}で 優勝！</p>
       ${lastTrophy ? `<div class="engrave-note">${def.name}に 刻まれた！</div>${plateHTML(lastTrophy)}` : ''}
       ${
         reward?.eraser
           ? `<div class="reward champ-reward">
                <div class="reward-title">🎁 優勝の ごほうび！ 限定消しゴム</div>
                <canvas class="reward-eraser big" data-id="${reward.eraser.id}"></canvas>
                <div><span class="rarity-tag r-champion">チャンピオン</span> <b>${reward.eraser.name}</b> が 手に入った！</div>
                <div class="trait"><b>✨ ${reward.eraser.trait.name}</b> ${reward.eraser.trait.desc}</div>
              </div>`
           : isMe
             ? '<div class="reward champ-reward"><div class="reward-title">🏆 限定消しゴムは ぜんぶ持っているよ！ すごい！</div></div>'
             : ''
       }
       ${isMe ? `<p class="note">🏆 これまでの 優勝：${collection.tournamentWins()}回</p>` : ''}
       <div class="row">
         <button class="btn ghost" data-act="title">タイトルへ</button>
         <button class="btn big primary" data-act="again">もう一度 トーナメント</button>
       </div>
     </div>`,
  );
  if (isMe) {
    confetti(el);
    sfx.win();
    if (reward?.eraser) setTimeout(() => sfx.rare(), 900);
  }
  whenFonts(() => {
    drawEraserPreview(el.querySelector('.result-eraser'), def);
    el.querySelectorAll('.reward-eraser').forEach((cv) => drawEraserPreview(cv, findEraser(cv.dataset.id)));
  });
  el.querySelector('[data-act=title]').onclick = showTitle;
  el.querySelector('[data-act=again]').onclick = () => startTournament(tour.eraserId);
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

function eraserDetail(el, def, onFavChange = null) {
  const ov = openModal(
    el,
    `<div class="modal detail ${rarityClass(def)}">
       ${rarityTag(def)}
       ${def.gacha ? '<div class="badge gacha static">ガチャ</div>' : ''}
       <canvas class="detail-eraser"></canvas>
       <div class="detail-name">${collection.isKira(def.id) ? '<span class="kira-mark">✨キラ</span>' : ''}${def.name}</div>
       <div class="detail-desc">${def.desc}</div>
       ${traitLine(def)}
       <div class="stats">${statMeters(def.stats)}</div>
       ${engraveHTML(def.id)}
       <div class="row">
         <button class="btn ${collection.isFavorite(def.id) ? 'fav-on' : ''}" data-act="fav">${collection.isFavorite(def.id) ? '★ お気に入り' : '☆ お気に入りに する'}</button>
         <button class="btn" data-act="close">閉じる</button>
       </div>
     </div>`,
  );
  ov.querySelector('.modal').classList.add('meters-in');
  whenFonts(() => drawEraserPreview(ov.querySelector('canvas'), def, -0.18, { kira: collection.isKira(def.id) }));
  const favBtn = ov.querySelector('[data-act=fav]');
  favBtn.onclick = (ev) => {
    ev.stopPropagation();
    const r = collection.toggleFavorite(def.id);
    if (!r.ok) {
      miniToast(el, r.reason);
      return;
    }
    favBtn.classList.toggle('fav-on', r.on);
    favBtn.textContent = r.on ? '★ お気に入り' : '☆ お気に入りに する';
    changed = true;
  };
  // まどを 閉じたら（お気に入りが かわっていれば）ページを 出しなおす
  let changed = false;
  if (onFavChange) {
    ov.addEventListener('click', (e) => {
      if (changed && (e.target === ov || e.target.closest('[data-act=close]'))) onFavChange();
    });
  }
}

function showZukan(tab = 'eraser') {
  const favs = collection.favorites().map(findEraser).filter((e) => e && collection.owns(e.id));
  const TABS = [
    { id: 'fav', label: '⭐お気に入り', items: favs },
    { id: 'eraser', label: '消しゴム', items: REGULAR_ERASERS.filter((e) => e.kind !== 'chara') },
    { id: 'chara', label: 'キャラ', items: REGULAR_ERASERS.filter((e) => e.kind === 'chara') },
    { id: 'special', label: '特別', items: SPECIAL_ERASERS },
    { id: 'kyushoku', label: '🍱給食', items: KYUSHOKU_ERASERS },
    { id: 'mukashi', label: '🎍昔あそび', items: MUKASHI_ERASERS },
    { id: 'sekai', label: '🌏世界', items: SEKAI_ERASERS },
    { id: 'gacha', label: '文房具', items: STATIONERY_ERASERS },
    { id: 'champion', label: '🏆優勝', items: CHAMPION_ERASERS },
    { id: 'card', label: 'カード', items: CARDS },
  ];
  const count = (t) =>
    t.id === 'card'
      ? t.items.filter((c) => collection.hasSeenCard(c.id)).length
      : t.items.filter((e) => collection.owns(e.id)).length;
  const total = (t) => (t.id === 'fav' ? GAME.collection.maxFavorites : t.items.length);
  // それぞれの ページで レア度の じゅん（ノーマル → レジェンド）。同じ レア度は 今までの じゅん。お気に入りは 登録した じゅん
  const RANK = { normal: 0, rare: 1, superrare: 2, ultra: 3, legend: 4, champion: 5 };
  for (const t of TABS) {
    if (t.id === 'fav') continue;
    t.items = t.items
      .map((item, i) => ({ item, i }))
      .sort((a, b) => (RANK[a.item.rarity || 'normal'] ?? 0) - (RANK[b.item.rarity || 'normal'] ?? 0) || a.i - b.i)
      .map((x) => x.item);
  }
  const cur = TABS.find((t) => t.id === tab);

  const cell = (item) => {
    if (cur.id === 'card') {
      return collection.hasSeenCard(item.id)
        ? `<button class="zukan-card" data-id="${item.id}">${cardHTML(item)}</button>`
        : `<div class="zukan-card unknown"><div class="card-back"><span>?</span></div></div>`;
    }
    const own = collection.owns(item.id);
    const seen = collection.hasSeen(item.id);
    const how = item.champion ? 'トーナメントで 優勝すると 手に入る' : item.gacha ? 'ガチャで手に入る' : 'CPUで 倒すと手に入る';
    return `
      <button class="zukan-cell ${own ? 'own ' + rarityClass(item) : 'locked'}" data-id="${item.id}" ${own ? '' : 'disabled'}>
        ${rarityTag(item)}
        <canvas></canvas>
        <div class="zukan-name">${own && collection.isKira(item.id) ? '✨' : ''}${own || seen ? item.name : '？？？'}</div>
        ${own ? '' : `<div class="zukan-how">${how}</div>`}
      </button>`;
  };

  let note = 'CPUが使っている消しゴムを 倒すと、自分も使えるようになるよ';
  if (cur.id === 'chara') note = 'キャラ消しゴムも、CPUが使っているのを 倒すと手に入るよ';
  if (cur.id === 'gacha' || cur.id === 'special' || cur.id === 'kyushoku' || cur.id === 'mukashi' || cur.id === 'sekai') note = `🎫 チケット ${collection.tickets()}枚。ガチャで手に入るよ（CPUに勝つと チケットが もらえることがあるよ）`;
  if (cur.id === 'champion') note = `🏆 トーナメントで 優勝すると、この中から 1つ もらえるよ（これまでの 優勝：${collection.tournamentWins()}回）`;
  if (cur.id === 'card') note = '対戦で 配られたカードが 埋まっていくよ';
  if (cur.id === 'fav') note = `⭐ お気に入りは ${GAME.collection.maxFavorites}つまで。消しゴムを選ぶ画面で いちばん上に 出るよ（はずすときは 消しゴムを タップ）`;

  const el = screen(
    `<h2 class="head">📖 図鑑</h2>
     ${tabNavHTML(TABS, tab, (t) => `<small>${count(t)}/${total(t)}</small>`)}
     <div class="zukan-grid fit-scroll ${cur.id === 'card' ? 'cards' : ''} ${cur.id === 'fav' ? 'favs' : ''}">${
       cur.id === 'fav' && !cur.items.length
         ? '<div class="fav-empty">まだ お気に入りが ないよ。<br>消しゴムを選ぶ画面の ☆ か、図鑑で 消しゴムを タップして「☆ お気に入りに する」を 押してね</div>'
         : cur.items.map(cell).join('')
     }</div>
     <p class="note">${note}</p>
     <div class="row">
       <button class="btn ghost" data-act="back">戻る</button>
       ${cur.id === 'gacha' || cur.id === 'special' || cur.id === 'kyushoku' || cur.id === 'mukashi' || cur.id === 'sekai' ? '<button class="btn primary" data-act="gacha">🎰 ガチャへ</button>' : ''}
     </div>`,
    'zukan-screen',
  );

  bindTabNav(el, TABS, tab, (id) => showZukan(id)); // タブ・◀ ▶・スワイプで ページを かえる
  if (cur.id !== 'card') {
    const cells = [...el.querySelectorAll('.zukan-cell')];
    whenFonts(() =>
      cells.forEach((c) => {
        const def = findEraser(c.dataset.id);
        const cv = c.querySelector('canvas');
        if (c.classList.contains('own')) drawEraserPreview(cv, def, -0.18, { kira: collection.isKira(def.id) });
        else drawSilhouette(cv, def);
      }),
    );
    cells.forEach((c) => {
      // お気に入りのページでは、はずしたら 出しなおす
      if (c.classList.contains('own')) c.onclick = () => eraserDetail(el, findEraser(c.dataset.id), cur.id === 'fav' ? () => showZukan('fav') : null);
    });
  } else {
    el.querySelectorAll('button.zukan-card').forEach((b) => {
      b.onclick = () => {
        const def = CARDS.find((c) => c.id === b.dataset.id);
        openModal(el, `<div class="modal">${cardHTML(def, 'big')}<button class="btn" data-act="close">閉じる</button></div>`);
      };
    });
  }
  el.querySelector('[data-act=back]').onclick = showTitle;
  el.querySelector('[data-act=gacha]')?.addEventListener('click', () =>
    showGacha(cur.id === 'sekai' ? 'asobi' : cur.id === 'mukashi' ? (isMukashiSeason() ? 'mukashi' : 'asobi') : 'normal'),
  );
}

// ---------- ガチャ ----------
const CAPSULE_COLORS = ['#ff6b6b', '#ffd166', '#4fc3f7', '#81c784', '#ba68c8', '#ff8a65'];
// カプセルが出てきたときの ひとこと（中身のレア度の ヒント）
const CAPSULE_HINT = {
  rare: '✨ 金色！ ✨<br>',
  superrare: '✨ 虹色！？ ✨<br>',
  ultra: '🌌 ギャラクシー！？ 🌌<br>',
  legend: '👑 ま、まさか…レジェンド！？ 👑<br>',
};

// ガチャの 種類ごとの 名前・色（スワイプで えらぶ）
const GACHA_INFO = {
  normal: { title: '🎰 特別ガチャ', label: '特別', zukan: 'special', note: '文房具・特別な消しゴム・🍱給食シリーズが出るよ。ウルトラレア・レジェンドも…！？' },
  asobi: { title: '🌏 あそびガチャ', label: 'あそび', zukan: 'sekai', note: '🌏世界の遊びシリーズが出るよ（🎍昔あそびシリーズも まれに）。いろいろな国の 遊びを 集めよう！' },
  mukashi: { title: '🎍 昔あそびガチャ', label: '昔あそび', zukan: 'mukashi', note: '🎍 お正月だけの ガチャ！ お手玉・こま・けん玉…昔あそびシリーズだけが 出るよ' },
};
let lastGachaMode = null;

function showGacha(mode = lastGachaMode || (isMukashiSeason() ? 'mukashi' : 'normal'), slide = 0) {
  const modes = gachaModes();
  if (!modes.includes(mode)) mode = 'normal';
  lastGachaMode = mode;
  const info = GACHA_INFO[mode];
  const tickets = collection.tickets();
  // ガチャ限定（文房具・とくべつ消しゴム）をぜんぶ集めたら、ふつうの消しゴムのガチャになる
  const pool = collection.gachaPool(mode);
  const isEraserGacha = pool.kind === 'eraser';
  const isMukashiGacha = mode === 'mukashi';
  const mi = modes.indexOf(mode);
  const switcher = `<div class="gacha-switch">
       <button class="gacha-arrow" data-go="-1" ${mi > 0 ? '' : 'disabled'} aria-label="前の ガチャ">◀</button>
       <div class="gacha-dots">${modes
         .map((m) => `<button class="gacha-dot ${m === mode ? 'on' : ''}" data-mode="${m}">${GACHA_INFO[m].title}${m === 'mukashi' ? `<small>${mukashiUntil()}まで</small>` : ''}</button>`)
         .join('')}</div>
       <button class="gacha-arrow" data-go="1" ${mi < modes.length - 1 ? '' : 'disabled'} aria-label="次の ガチャ">▶</button>
     </div>`;
  const canPull = tickets > 0 && pool.items.length > 0;
  const toNew = collection.pullsToNew(mode);
  const capsules = Array.from({ length: 16 }, (_, i) => {
    // 下からつみあがるように、少しずつずらして並べる
    const row = Math.floor(i / 4);
    const x = 10 + (i % 4) * 20 + (row % 2) * 9 + ((i * 7) % 5);
    const y = 68 - row * 20 + ((i * 5) % 6);
    // まわすときに ガチャガチャ うごく向き・大きさ（1こずつ ちがう）
    const mix = `--mx:${((i * 37) % 21) - 10}px;--my:${-8 - ((i * 13) % 14)}px;--mr:${((i * 53) % 120) - 60}deg;--d:${((i * 7) % 10) * 0.03}s`;
    return `<span class="capsule" style="left:${x}%;top:${y}%;--c:${CAPSULE_COLORS[i % CAPSULE_COLORS.length]};${mix}"></span>`;
  }).join('');
  let msg = 'チケットが ないよ。CPUと 戦おう！';
  if (canPull) msg = 'ハンドルを タップして 回そう！';
  if (canPull && pool.kind === 'done') msg = '全部 集めた！ すごい！ ダブると キラや かけらに なるよ';

  const el = screen(
    `<h2 class="head">${isEraserGacha ? '🎰 消しゴムガチャ' : info.title}</h2>
     ${switcher}
     <p class="note gacha-phase">${isEraserGacha ? '🎉 ガチャ限定を 全部集めたから、まだ持っていない 普通の消しゴムも まざるよ' : info.note}</p>
     <p class="note">同じものが 出ることも あるよ。2回目は ✨キラ（光る色ちがい）、3回目からは かけら（${GAME.collection.shardsPerTicket}こで チケット1枚）<br>
       チケットは CPUに勝つと もらえることがあるよ（${GAME.collection.pityMatches}戦ごとに 必ず1枚）。お金は いらないよ</p>
     <div class="gacha-machine mode-${mode} ${slide > 0 ? 'slide-l' : slide < 0 ? 'slide-r' : ''}">
       <div class="gacha-dome">${capsules || '<span class="gacha-empty">空っぽ！</span>'}</div>
       <div class="gacha-body">
         <div class="gacha-label">${isEraserGacha ? '消しゴム' : info.label}</div>
         <button class="gacha-handle" data-act="pull" ${canPull ? '' : 'disabled'} aria-label="回す"><span></span></button>
         <div class="gacha-out"></div>
       </div>
     </div>
     <div class="gacha-info">
       <span>🎫 チケット <b>${tickets}</b>枚</span>
       <span>集めた <b>${pool.owned}</b> / ${pool.total}</span>
       <span>🧩 かけら <b>${collection.shards()}</b> / ${GAME.collection.shardsPerTicket}</span>
     </div>
     ${toNew != null ? `<p class="note gacha-pity">${toNew === 1 ? '🌟 つぎは かならず 新しいのが出る！' : `あと ${toNew}回で かならず 新しいのが出る`}</p>` : ''}
     <p class="note gacha-msg">${msg}</p>
     <div class="row">
       <button class="btn ghost" data-act="back">戻る</button>
       <button class="btn" data-act="zukan">📖 図鑑</button>
     </div>`,
    'gacha-screen',
  );
  el.querySelector('[data-act=back]').onclick = showTitle;
  el.querySelector('[data-act=zukan]').onclick = () => showZukan(isEraserGacha ? 'eraser' : info.zukan);
  // ガチャを かえる：◀ ▶・名前を タップ・左右に スワイプ
  let busy = false; // 回している 間は かえない
  const go = (d) => {
    const next = modes[mi + d];
    if (!next || busy) return;
    sfx.tap();
    showGacha(next, d);
  };
  el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(Number(b.dataset.go))));
  el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => b.dataset.mode !== mode && go(modes.indexOf(b.dataset.mode) - mi)));
  {
    let sx = null;
    let sy = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      sx = e.clientX;
      sy = e.clientY;
    });
    el.addEventListener('pointerup', (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
    });
    el.addEventListener('pointercancel', () => (sx = null));
  }

  const handle = el.querySelector('[data-act=pull]');
  handle.onclick = () => {
    const res = collection.pullGacha(mode);
    if (!res) return;
    busy = true;
    const def = res.def;
    handle.disabled = true;
    el.querySelector('[data-act=back]').disabled = true;
    el.querySelector('[data-act=zukan]').disabled = true;
    const rarity = def.rarity || 'normal';
    // カプセルの色：レアは金色、スーパーレアは にじ色（中身のヒント）
    const normalColors = CAPSULE_COLORS.filter((c) => c !== '#ffd166');
    const color = normalColors[Math.floor(Math.random() * normalColors.length)];
    const msg = el.querySelector('.gacha-msg');
    const machine = el.querySelector('.gacha-machine');
    const dome = el.querySelector('.gacha-dome');

    // 1) ハンドルを ぐるっと2回まわす。中のカプセルが ガチャガチャ うごく
    handle.classList.add('spin');
    dome.classList.add('mixing');
    machine.classList.add('shaking');
    msg.textContent = 'ガチャ… ガチャ…';
    for (let k = 0; k < 8; k++) setTimeout(() => sfx.tap(), k * 200);
    setTimeout(() => sfx.whoosh(), 300);

    // 2) カプセルが ゴトンと 出てくる
    setTimeout(() => {
      dome.classList.remove('mixing');
      machine.classList.remove('shaking');
      const out = el.querySelector('.gacha-out');
      out.innerHTML = `<span class="capsule big drop r-${rarity}" style="--c:${color}"></span>`;
      sfx.hit(8);
      msg.textContent = 'ゴトン！';
      if (rarity !== 'normal') setTimeout(() => sfx.rare(), 250);
    }, 1700);

    // 3) カプセルが 画面のまん中へ ころがってくる → タップで あける
    setTimeout(() => {
      el.querySelector('.gacha-out').innerHTML = '';
      const stage = document.createElement('div');
      stage.className = `cap-stage r-${rarity}`;
      stage.innerHTML = `
        <div class="cap-rays"></div>
        <div class="cap-flash"></div>
        <button class="cap-big r-${rarity}" style="--c:${color}" aria-label="開ける">
          <i class="cap-top"></i><i class="cap-bot"></i>
        </button>
        <p class="cap-msg">${CAPSULE_HINT[rarity] || ''}タップして 開けよう！</p>`;
      el.appendChild(stage);
      sfx.whoosh();
      const cap = stage.querySelector('.cap-big');
      let opened = false;
      const open = () => {
        if (opened) return;
        opened = true;
        stage.querySelector('.cap-msg').textContent = '';
        cap.classList.add('shake');
        sfx.hit(5);
        setTimeout(() => sfx.hit(6), 180);
        setTimeout(() => {
          cap.classList.remove('shake');
          cap.classList.add('open');
          stage.classList.add('open');
          sfx.flip();
          sfx.rare();
          setTimeout(() => {
            stage.remove();
            reveal(res);
          }, 700);
        }, 520);
      };
      cap.onclick = open;
      setTimeout(open, 4000); // さわらなくても開く
    }, 2500);
  };

  function reveal({ def, kind, shards, ticketBack }) {
    setTimeout(() => sfx.rare(), 300);
    const extra = { superrare: 1, ultra: 2, legend: 3 }[def.rarity] || 0; // レアなほど キラキラが ふえる
    for (let k = 0; k < extra; k++) setTimeout(() => sfx.rare(), 700 + k * 380);
    if (kind === 'kira') setTimeout(() => sfx.rare(), 500);
    const head = { new: '<div class="reveal-new">NEW!</div>', kira: '<div class="reveal-new kira">✨ キラに なった！ ✨</div>', shard: '<div class="reveal-new shard">🧩 かけら ゲット！</div>' }[kind];
    const note = {
      new: '対戦で 使えるようになったよ！',
      kira: '2回目だから キラ（光る色ちがい）に なったよ！ 強さは 同じ。キラは 対戦でも 光るよ',
      shard: ticketBack
        ? `🎫 かけらが ${GAME.collection.shardsPerTicket}こ たまって、チケット1枚に なった！`
        : `かけら ${shards} / ${GAME.collection.shardsPerTicket}（${GAME.collection.shardsPerTicket}こで チケット1枚）`,
    }[kind];
    const ov = openModal(
      el,
      `<div class="modal detail reveal ${rarityClass(def)}">
         ${rarityTag(def)}
         ${head}
         <canvas class="detail-eraser"></canvas>
         <div class="detail-name">${collection.isKira(def.id) ? '✨' : ''}${def.name}</div>
         <div class="detail-desc">${def.desc}</div>
         ${kind === 'new' ? traitLine(def) : ''}
         ${kind === 'new' ? `<div class="stats">${statMeters(def.stats)}</div>` : ''}
         <p class="note">${note}</p>
         <button class="btn primary" data-act="close">${kind === 'shard' ? 'OK' : 'やったね！'}</button>
       </div>`,
    );
    ov.querySelector('.modal').classList.add('meters-in');
    const cv = ov.querySelector('canvas');
    whenFonts(() => drawEraserPreview(cv, def, -0.18, { kira: collection.isKira(def.id) }));
    // キラは キラキラが うごくように 少しのあいだ かきなおす
    if (collection.isKira(def.id)) {
      const t0 = performance.now();
      const loop = () => {
        if (!cv.isConnected || performance.now() - t0 > 20000) return;
        drawEraserPreview(cv, def, -0.18, { kira: true });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-act=close]')) showGacha(mode);
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

// 招待リンク（?room=1234）から 来たら、その部屋に 入る 画面へ
{
  const params = new URLSearchParams(location.search);
  const code = params.get('room');
  if (code && new RegExp(`^\\d{${ONLINE.codeDigits}}$`).test(code)) {
    params.delete('room'); // 読みこみなおしても もう一度 入らないように
    const q = params.toString().replace(/=(&|$)/g, '$1');
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}`);
    setup.mode = 'online';
    online.joinInvite(code);
  } else showTitle();
}
