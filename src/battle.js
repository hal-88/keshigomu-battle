// 対戦画面。ロジック(Game)・描画(CanvasRenderer)・操作(FlickInput)・CPU・効果音・演出をつなぐ。
//
// オンラインのとき（online を渡す）
//   ・自分の番：自分の端末で物理を計算し、動き（stream）を少しずつ送る。番が終わったら状態をまるごと送る
//   ・ほかの人の番：自分では計算せず、とどいた動きをそのまま見せる（だから全員の画面で同じ動き・同じ演出）
//   ・通信が切れた人の番は、残っている人のうち一番前の人が「脱落」にして先へ進める

import { Game } from './logic/Game.js';
import { CanvasRenderer } from './render/CanvasRenderer.js';
import { FlickInput } from './input/FlickInput.js';
import { planCpuShot, planCpuCard, chooseCpuPiece } from './ai/cpu.js';
import { GAME } from './config/game.js';
import { PHYSICS } from './config/physics.js';
import { ONLINE } from './config/online.js';
import { CARD_TYPES } from './config/cards.js';
import { cardHTML, flipCardHTML } from './ui/cardView.js';
import { sfx, isMuted, setMuted } from './audio/sfx.js';
import { collection } from './progress/collection.js';
import { packView, unpackView, packEvent, unpackEvent } from './online/viewCodec.js';
import { createReplayRecorder } from './replay/replay.js';
import { drawEraser } from './render/drawEraser.js';
import { eraserExtent } from './logic/geometry.js';

// 名前を HTML に入れるときは、記号をそのまま文字として出す
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const PLACE_HINT = {
  pencil: '鉛筆を置くところを触って、そのままぐるっと向きを決めよう',
  circle: 'つるつるにしたいところを タップ！',
  eraser: 'ワープしたいところを タップ！',
};

// オンラインで、ほかの人の画面にも送る「できごと」（音や演出のため）
const STREAM_EVENTS = new Set([
  'flick', 'hit', 'fall', 'hold', 'card', 'split', 'pieceFall', 'trait', 'cardFx',
  'again', 'resume', 'skipped', 'shrinkWarn', 'shrink', 'newCard', 'nextCard', 'stageFx',
]);

/**
 * @param online オンラインのとき { session, myIndex, order, seq, state, cpuOwner, spectator }
 *               cpuOwner … この端末が CPU の番も 計算して 送る（トーナメントの 人と CPU の試合）
 *               spectator … 観戦（myIndex は -1。見ているだけ）
 */
export function createBattle(root, { desk, players, onEnd, onQuit, label = '', hideCpuCards = false, online = null, firstTurn = 0 }) {
  root.innerHTML = `
    <div class="hud">
      <div class="turn-badge" data-el="turn"></div>
      <div class="hud-mid">
        <span class="turn-count" data-el="count"></span>
        <span class="sd-badge" data-el="sd">サドンデス</span>
      </div>
      <div class="hud-right">
        <button class="btn small ghost" data-el="sound" aria-label="音"></button>
        <button class="btn small ghost" data-el="quit">やめる</button>
      </div>
    </div>
    <div class="stage">
      <canvas class="board"></canvas>
      <div class="eraser-bar" data-el="ebar"></div>
      <div class="ebar-info" data-el="ebarInfo"></div>
      <div class="toast" data-el="toast"></div>
      <div class="hint" data-el="hint"></div>
      <button class="card-btn" data-el="cardBtn"></button>
      ${online ? '<button class="stamp-btn" data-el="stampBtn" aria-label="スタンプ">💬</button><div class="stamp-palette" data-el="stamps"></div>' : ''}
      <div class="banner" data-el="banner">
        <span data-el="bannerText"></span>
        <button class="btn small ghost" data-el="bannerCancel">やめる</button>
      </div>
      <div class="overlay" data-el="overlay"></div>
    </div>`;
  const $ = (name) => root.querySelector(`[data-el="${name}"]`);
  const canvas = root.querySelector('canvas.board');

  const game = new Game({ desk, players, firstTurn });
  if (online?.state) game.importState(online.state);
  const renderer = new CanvasRenderer(canvas);
  // 名場面リプレイ：画面の様子と 演出を 記録しておく（落ちた場面を あとで 動画に できる）
  const replay = createReplayRecorder();
  {
    const addFx = renderer.addEffect.bind(renderer);
    renderer.addEffect = (fx) => {
      replay.effect(performance.now(), 'fx', fx);
      addFx(fx);
    };
    const shake = renderer.shake.bind(renderer);
    renderer.shake = (ms, power) => {
      replay.effect(performance.now(), 'shake', [ms, power]);
      shake(ms, power);
    };
  }
  const input = new FlickInput(canvas, renderer, game);
  if (import.meta.env.DEV) window.__game = game; // 開発中の確認用

  let destroyed = false;
  let raf = 0;
  let cpuAim = null;
  let cpuSteerTarget = -1;
  let slow = null; // スロー演出 { start, idx }
  let overlayOpen = false;
  let overShown = false;
  const flickedOnce = new Set(); // 一度でも弾いた人（はじめての人にだけ説明を出す）
  const timers = new Set();
  const later = (ms, fn) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!destroyed) fn();
    }, ms);
    timers.add(id);
  };

  // ---- オンラインの準備 ----
  const isMyTurn = () =>
    !online || game.turnIndex === online.myIndex || (!!online.cpuOwner && game.players[game.turnIndex]?.type === 'cpu');
  const spectator = !!online?.spectator;
  // この画面を見ている人（オンラインは自分。ひとが1人だけなら その人。みんなで1台なら -1）
  const humans = players.map((p, i) => (p.type === 'human' ? i : -1)).filter((i) => i >= 0);
  const viewerIndex = online ? online.myIndex : humans.length === 1 ? humans[0] : -1;
  let remoteView = null; // ほかの人の番に、とどいた動きで作る「見た目の状態」
  const shown = new Map(); // pid → 画面に出している位置（なめらかに動かすため）
  // 画面に出す状態（ほかの人の番は、とどいた動き）
  const currentState = () => (online && !isMyTurn() && remoteView ? remoteView : game.getState());
  const posOf = (i) => currentState().erasers[i];

  // ゲームのできごと：音や演出を出す。オンラインで自分が動かしているときは、みんなにも送る
  const remoteHandlers = {};
  const evQueue = [];
  function on(name, fn) {
    game.on(name, (data) => {
      fn(data);
      if (online && STREAM_EVENTS.has(name)) evQueue.push(packEvent(name, data));
    });
    (remoteHandlers[name] ||= []).push(fn);
  }

  // ---- 画面サイズ ----
  const ro = new ResizeObserver(() => renderer.resize(desk));
  ro.observe(canvas);
  renderer.resize(desk);

  // ---- 表示 ----
  function updateHud(text) {
    const p = game.players[game.turnIndex];
    $('turn').textContent = text || `${p.name}の番`;
    $('turn').style.background = p.color;
    $('count').textContent = `${label ? label + ' ' : ''}ターン ${game.turnCount}`;
    $('sd').classList.toggle('show', game.turnCount >= GAME.suddenDeath.startTurn);
    updateEbar();
  }

  // 上の 帯：みんなの 消しゴムと 能力（タップで くわしく）
  function updateEbar() {
    $('ebar').innerHTML = game.players
      .map((p, i) => {
        const e = game.erasers[i];
        const def = e?.def || p.eraser;
        const t = def.trait;
        return `<button class="ebar-chip ${i === game.turnIndex ? 'now' : ''} ${e && !e.alive ? 'out' : ''}" data-i="${i}" style="--c:${p.color}">
            <canvas class="ebar-pic" width="76" height="56"></canvas>
            <b>${esc(p.name)}</b><span>${esc(def.name)}</span><small>${t ? `✨${esc(t.name)}` : 'とくせい なし'}</small>
          </button>`;
      })
      .join('');
    // 小さな 消しゴムの 絵
    $('ebar').querySelectorAll('.ebar-chip').forEach((chip) => {
      const i = Number(chip.dataset.i);
      const def = game.erasers[i]?.def || game.players[i].eraser;
      const cv = chip.querySelector('canvas');
      const ctx = cv.getContext('2d');
      const k = Math.min(1.4, 24 / (eraserExtent(def) || 20));
      ctx.clearRect(0, 0, cv.width, cv.height);
      drawEraser(ctx, def, cv.width / 2, cv.height / 2, -0.15, { scale: k, shadow: false });
    });
  }
  $('ebar').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-i]');
    if (!b) return;
    const i = Number(b.dataset.i);
    const def = game.erasers[i]?.def || game.players[i].eraser;
    const t = def.trait;
    // くわしい 説明は 帯の 下に 小さく（数秒で 消える。もう一度 タップでも 消える）
    const box = $('ebarInfo');
    if (box.classList.contains('show') && box.dataset.i === String(i)) {
      box.classList.remove('show');
      return;
    }
    box.dataset.i = String(i);
    box.style.top = `${$('ebar').offsetTop + $('ebar').offsetHeight + 4}px`; // 帯の すぐ下
    box.style.setProperty('--c', game.players[i].color);
    box.innerHTML = `<b>${esc(def.name)}</b>${t ? `　✨${esc(t.name)}<br>${esc(t.desc)}` : '　とくせい なし'}`;
    box.classList.add('show');
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.remove('show'), 5000);
  });

  function toast(text, color = '#fff') {
    const el = $('toast');
    el.textContent = text;
    el.style.color = color;
    el.classList.remove('show');
    void el.offsetWidth; // アニメーションをやり直すため
    el.classList.add('show');
  }

  function setHint(text) {
    $('hint').textContent = text || '';
    $('hint').classList.toggle('show', !!text);
  }

  function updateSoundBtn() {
    $('sound').textContent = isMuted() ? '🔇' : '🔊';
  }
  updateSoundBtn();
  $('sound').addEventListener('click', () => {
    setMuted(!isMuted());
    updateSoundBtn();
  });

  function openOverlay(html) {
    overlayOpen = true;
    $('overlay').innerHTML = html;
    $('overlay').classList.add('show');
    return $('overlay');
  }
  function closeOverlay() {
    overlayOpen = false;
    $('overlay').classList.remove('show');
    $('overlay').innerHTML = '';
  }

  // CPU（ないしょのとき）とオンラインの相手のカードは、使うまで見せない
  const isSecret = (p) => (hideCpuCards && p.type === 'cpu') || p.type === 'remote';

  // ---- ターンの始まり ----
  function onTurnStart({ again = false } = {}) {
    const p = game.players[game.turnIndex];
    if (p.type === 'cpu') {
      // カードが使えるかどうかは Game が判断する（じしんのあとも、おかわりの残りが使える）
      runCpu(game.turnIndex, p, true);
      return;
    }
    if (p.type === 'remote') {
      // オンラインの相手の番：見ているだけ
      if (!again) toast(`${p.name}の番！`, '#fff');
      setHint(spectator ? '👀 観戦中（スタンプで 応援できるよ）' : '');
      return;
    }
    if (!again) toast(online ? 'あなたの番！' : `${p.name}の番！`, '#fff');
    if (game.isReversed(game.turnIndex)) {
      setHint('🔃 逆さま！ 引っぱる向きが 反対になるよ（矢印のほうに飛ぶ）');
    } else if (game.turn.powerMul >= 2) {
      setHint('🔋 パワーが たまった！ 2倍の強さで 弾けるよ');
    } else if (game.isConfused(game.turnIndex)) {
      setHint('🍓 混乱中！ 5回に1回くらい、反対に 弱く 飛んじゃうよ');
    } else if (game.extrasOf(game.turnIndex).length) {
      setHint('2つに分かれているよ。弾くほうを 触ってね');
    } else {
      setHint(flickedOnce.has(game.turnIndex) ? '' : `画面の どこからでも 引っぱって 離そう！ 消しゴムの 横の ほうから 引くと 回転するよ`);
    }
  }

  // ---- カード（人） ----
  function refreshCardBtn() {
    const i = game.turnIndex;
    const p = game.players[i];
    const show =
      p.type === 'human' && game.canUseCard(i) && !input.placement && !input.targeting &&
      !overlayOpen && !input.drag;
    const btn = $('cardBtn');
    const key = show ? `${i}:${p.card.def.id}` : '';
    if (show && btn.dataset.pi !== key) {
      const def = p.card.def;
      btn.dataset.pi = key;
      btn.style.setProperty('--type', CARD_TYPES[def.type].color);
      btn.innerHTML = `<span class="card-btn-icon">${def.icon}</span>
        <span class="card-btn-text"><small>カードを使う</small>${def.name}</span>`;
    }
    if (!show) btn.dataset.pi = '';
    btn.classList.toggle('show', show);
  }


  $('cardBtn').addEventListener('click', () => {
    const i = game.turnIndex;
    if (!game.canUseCard(i)) return;
    const def = game.players[i].card.def;
    sfx.tap();
    const ov = openOverlay(`
      <div class="modal">
        ${cardHTML(def, 'big')}
        <div class="row">
          <button class="btn ghost" data-act="cancel">やめる</button>
          <button class="btn primary" data-act="use">使う！</button>
        </div>
      </div>`);
    ov.querySelector('[data-act=cancel]').onclick = closeOverlay;
    ov.querySelector('[data-act=use]').onclick = () => {
      closeOverlay();
      beginUse(i, def);
    };
  });

  // カードを使う（場所や 相手を えらぶものは、えらんでから）
  function beginUse(i, def) {
    const opps = game.opponentsOf(i, def.id); // クロケシのガードは えらべない
    if (def.place === 'seat') startSeating(i, def);
    else if (def.place) startPlacement(i, def);
    else if (def.target && opps.length > 1) startTargeting(i, def, opps);
    else {
      const r = game.useCard(i, {});
      if (!r.ok) toast(r.reason, '#ffd54f'); // たとえば「相手はガードしているよ」
    }
  }

  // 相手が2人以上いるとき：だれに使うか、消しゴムをタップしてえらぶ
  function startTargeting(i, def, candidates) {
    input.setTargeting({
      candidates,
      onPick: (target) => {
        endPlacement();
        game.useCard(i, { target });
      },
    });
    $('bannerText').textContent = `${def.name}：だれに 使う？ 相手の消しゴムを タップ！`;
    $('banner').classList.add('show');
    setHint('');
  }

  function startPlacement(i, def) {
    input.setPlacement({
      kind: def.place,
      def,
      playerIndex: i,
      onPlace: (params) => {
        const r = game.useCard(i, params);
        if (r.ok) endPlacement();
        else toast(r.reason, '#ffd54f');
      },
      onInvalid: (reason) => toast(reason || 'そこには置けないよ', '#ffd54f'),
    });
    $('bannerText').textContent = def.placeHint || PLACE_HINT[def.place];
    $('banner').classList.add('show');
    setHint('');
  }
  // せきがえ：ぜんぶの消しゴムを、1こずつ タップで ならべなおす
  function startSeating(i, def) {
    const order = game.seatOrder(i);
    const chosen = [];
    const next = () => {
      const k = chosen.length;
      if (k >= order.length) {
        endPlacement();
        const r = game.useCard(i, { seats: chosen });
        if (!r.ok) toast(r.reason, '#ffd54f');
        return;
      }
      const piece = game.pieceByPid(order[k]);
      const owner = game.players[piece.playerIndex];
      input.setPlacement({
        kind: 'seat',
        def,
        pid: order[k],
        chosen,
        playerIndex: i,
        onPlace: ({ x, y }) => {
          chosen.push({ pid: order[k], x, y });
          sfx.tap();
          next();
        },
        onInvalid: (reason) => toast(reason || 'そこには置けないよ', '#ffd54f'),
      });
      const who = piece.playerIndex === i ? '自分' : owner.name;
      $('bannerText').textContent = `🪑 席替え（${k + 1}/${order.length}）：${who}の ${piece.def.name}を 置くところを タップ！`;
      $('banner').classList.add('show');
      setHint('');
    };
    next();
  }

  function endPlacement() {
    input.setPlacement(null);
    input.setTargeting(null);
    $('banner').classList.remove('show');
  }
  $('bannerCancel').addEventListener('click', endPlacement);

  // ---- CPU ----
  function runCpu(idx, p, allowCard) {
    const cfg = GAME.cpu[p.level || 'normal'];
    later(cfg.thinkMs, () => {
      if (allowCard) {
        const params = planCpuCard(game, idx, cfg);
        if (params) {
          announceCard(idx, () => {
            game.useCard(idx, params);
            // じしん・せんぷうき・ぐるぐるは止まってから（resume で続き）
            if (game.phase !== 'aim' || game.turnIndex !== idx) return;
            // おかわりで新しいカードが来たら、もう一度考える（新しいカードを見せてから）
            if (game.canUseCard(idx)) later(params && game.players[idx].cardQueue?.length ? 2500 : 1200, () => runCpu(idx, p, true));
            else later(500, () => cpuShoot(idx, cfg));
          });
          return;
        }
      }
      cpuShoot(idx, cfg);
    });
  }

  function cpuShoot(idx, cfg) {
    if (game.phase !== 'aim' || game.turnIndex !== idx) return;
    chooseCpuPiece(game, idx); // パカッターが分かれていたら、弾くほうをえらぶ
    const plan = planCpuShot(game, idx, cfg);
    cpuSteerTarget = plan.target ?? -1;
    const start = performance.now();
    cpuAim = { playerIndex: idx, dirX: plan.dirX, dirY: plan.dirY, strength: 0, spin: plan.spin || 0 };
    const tick = () => {
      if (destroyed) return;
      const t = Math.min(1, (performance.now() - start) / cfg.aimShowMs);
      cpuAim.strength = plan.strength * (1 - (1 - t) * (1 - t));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        later(150, () => {
          cpuAim = null;
          game.flick(idx, plan.dirX, plan.dirY, plan.strength, plan.spin || 0);
        });
      }
    };
    requestAnimationFrame(tick);
  }

  // CPU がカードを使うとき、めくれるカードで見せる
  function announceCard(idx, done) {
    const p = game.players[idx];
    const ov = openOverlay(`
      <div class="announce">
        <div class="announce-title" style="color:${p.color}">${esc(p.name)}が カードを使った！</div>
        ${flipCardHTML(p.card.def)}
      </div>`);
    later(250, () => {
      ov.querySelector('.flip')?.classList.add('open');
      sfx.flip();
    });
    later(1700, () => {
      closeOverlay();
      done();
    });
  }

  // ---- ゲームからの知らせ ----
  on('flick', ({ playerIndex, strength, backfire }) => {
    sfx.flick(strength);
    if (backfire) {
      sfx.boing();
      toast('🍓 あっ！ 反対に 飛んじゃった！', '#ff6f91');
    }
    if (game.players[playerIndex].type === 'human') {
      flickedOnce.add(playerIndex);
      setHint(game.turn.curve?.brush ? '動いている間に 画面を さわると ブラシで のびるよ！' : game.turn.curve ? '画面をなぞると 曲がるよ！' : '');
    }
  });

  on('hit', ({ x, y, power, pencil }) => {
    sfx.hit(power, pencil);
    renderer.addEffect({ type: 'burst', x, y, power, dur: 300 });
  });

  on('fall', ({ playerIndex, gone }) => {
    const p = game.players[playerIndex];
    if (gone) {
      // オンラインで通信が切れて脱落
      toast(`${p.name}は 通信が切れたので 脱落…`, p.color);
      return;
    }
    sfx.fall();
    toast(`${p.name}が 落ちた！`, p.color);
    updateEbar();
    // ふりかえり：落ちた ときを しるしに
    {
      const shooter = game.turnIndex;
      const sp = game.players[shooter];
      const text = shooter === playerIndex || !sp ? `${p.name}が 落ちた` : `${sp.name}が ${p.name}を 落とした`;
      replay.knockout(performance.now(), { text, fallen: playerIndex, shooter, color: p.color });
    }
    slow = { start: performance.now(), idx: playerIndex };
  });

  // ---- とくせい ----
  on('split', ({ playerIndex, x, y, x2, y2 }) => {
    const p = game.players[playerIndex];
    sfx.crumble();
    later(120, () => sfx.whoosh());
    renderer.shake(250, 5);
    renderer.addEffect({ type: 'ring', x, y, color: p.color, dur: 600, r: 20, grow: 50 });
    renderer.addEffect({ type: 'ring', x: x2, y: y2, color: p.color, dur: 600, r: 20, grow: 50 });
    renderer.addEffect({ type: 'text', x: (x + x2) / 2, y: (y + y2) / 2, text: 'パカッ！', color: '#ff9f43', stroke: true, size: 30, dur: 1300 });
    toast(`${p.name}が 2つに分かれた！`, p.color);
    if (p.type === 'human') setHint('どっちを弾くか、触って選べるよ');
  });
  on('pieceFall', ({ playerIndex, x, y }) => {
    const p = game.players[playerIndex];
    sfx.fall();
    renderer.addEffect({ type: 'text', x, y, text: 'セーフ！', color: '#4fc3f7', stroke: true, size: 26, dur: 1300 });
    later(300, () => toast(`かけらが落ちた！ でも ${p.name}は まだ残ってる`, p.color));
  });
  on('trait', ({ type, playerIndex, x, y, left, look, value, name, x2, y2 }) => {
    const p = game.players[playerIndex];
    const say = (text, color, size = 22, dur = 1300) => renderer.addEffect({ type: 'text', x, y, text, color, stroke: true, size, dur });
    const ring = (color, r = 20, grow = 40, dur = 500, at = { x, y }) => renderer.addEffect({ type: 'ring', x: at.x, y: at.y, color, dur, r, grow });
    if (type === 'coverOff' && look === 'neta') {
      sfx.whoosh();
      say('🍣 ネタが 飛んだ！', '#ff7043');
      ring('#ff8a65');
    } else if (type === 'coverOff') {
      sfx.whoosh();
      renderer.addEffect({ type: 'text', x, y, text: 'カバーが 取れた！', color: '#26a69a', stroke: true, size: 22, dur: 1300 });
      renderer.addEffect({ type: 'ring', x, y, color: '#26a69a', dur: 500, r: 20, grow: 40 });
    } else if (type === 'dice') {
      sfx.tap();
      say(`🎲 ${value}「${name}」`, '#455a64', 20, 1500);
    } else if (type === 'boost') {
      sfx.whoosh();
      say('🚀 ブースト！', '#ff6d00', 24);
    } else if (type === 'block') {
      sfx.hit(4, true);
      say('🧱 ブロック！', '#1e88e5', 20);
    } else if (type === 'dodge') {
      sfx.whoosh();
      renderer.addEffect({ type: 'burst', x, y, color: '#b0bec5', dur: 450 });
      say('💨 ドロン！', '#455a64', 26, 1400);
      ring('#90a4ae', 14, 30, 400, { x: x2, y: y2 });
    } else if (type === 'ghost') {
      sfx.whoosh();
      say('👻 すり抜け！', '#7986cb', 26, 1400);
    } else if (type === 'mirror') {
      sfx.boing();
      ring('#eceff1', 24, 50, 500);
      say('🪞 はねかえし！', '#78909c', 26, 1400);
    } else if (type === 'tail') {
      sfx.hit(7);
      say('🦖 しっぽ ペシッ！', '#43a047', 22);
    } else if (type === 'corner') {
      sfx.hit(10);
      renderer.shake(250, 7);
      say('✨ 角アタック！', '#1565c0', 26, 1400);
    } else if (type === 'hatch') {
      sfx.rare();
      ring('#ffe082', 20, 60, 600);
      say(`🥚 パカッ！ ${name}が 出てきた！`, '#f57f17', 22, 1800);
    } else if (type === 'topple') {
      sfx.boing();
      say('🏆 ゴロン！ 倒れた！', '#b8860b');
    } else if (type === 'hop') {
      say(['ケン！', 'ケン！', 'パ！'][Math.min(2, (value || 1) - 1)], '#1565c0', 18, 700);
    } else if (type === 'snowGrow') {
      say('☃️ 大きくなった！', '#4fc3f7', 18, 1100);
    } else if (type === 'molkky') {
      if (value) sfx.hit(6);
      say(value ? `🪵 まとめて ドン！（${value}こ）` : '🪵 ドン', '#8d6e63', 18, 1100);
    } else if (type === 'shagai') {
      sfx.flip();
      say(`${name}！`, '#fff', 22, 1300);
      if (p.type === 'human') later(300, () => toast(`シャガイ：${name}${{ 0: '（速い）', 1: '（重い）', 2: '（やわらか）', 3: '（はね返す）' }[value] || ''}`, '#f3e5c8'));
    } else if (type === 'capoeira') {
      sfx.whoosh();
      renderer.addEffect({ type: 'ring', x, y, color: '#ffd600', dur: 600, r: 30, grow: 110 });
      say('🦶 回しげり！', '#009c3b', 22, 1300);
    } else if (type === 'dominoSet') {
      say('ドミノ 準備OK', '#fafafa', 16, 1000);
    } else if (type === 'domino') {
      sfx.hit(4, true);
      say('パタッ', '#fafafa', 16, 600);
    } else if (type === 'homerun') {
      sfx.hit(12);
      renderer.shake(300, 7);
      say('⚾ カキーン！ ホームラン！', '#e53935', 26, 1700);
    } else if (type === 'bambooSet') {
      say('🎋 竹を 置いた！', '#8bc34a', 18, 1100);
    } else if (type === 'bamboo') {
      sfx.hit(8, true);
      say(value ? `🎋 カチャン！ ${name}が はさまれた！` : '🎋 カチャン！', '#558b2f', 20, 1600);
    } else if (type === 'takraw') {
      say(`🤸 宙返り キック！（あと${value}回）`, '#ffb300', 20, 1200);
    } else if (type === 'takrawHit') {
      sfx.hit(12);
      say('ドーン！ 2倍！', '#ff7043', 24, 1200);
    } else if (type === 'petanque') {
      sfx.rare();
      say('🎯 まんなか！ パワーアップ', '#ffb300', 20);
    } else if (type === 'kabaddi') {
      say('カバディ！ カバディ！', '#ff9933', 24, 1400);
      // その国の 遊び方：「カバディ」と 声に 出す（音あり のときだけ）
      if (!isMuted() && 'speechSynthesis' in window) {
        try {
          const u = new SpeechSynthesisUtterance('カバディ、カバディ');
          u.lang = 'ja-JP';
          u.rate = 1.4;
          u.pitch = 1.3;
          speechSynthesis.cancel();
          speechSynthesis.speak(u);
        } catch {
          /* 声が 出せない 端末 */
        }
      }
      if (p.type === 'human') setHint('カバディ！ もう1回 弾けるよ');
    } else if (type === 'kabaddiBack') {
      say('あっ もどった…', '#ff9933', 16, 1000);
    } else if (type === 'knight') {
      sfx.whoosh();
      say('♞ カクッ！', '#eceff1', 20, 900);
    } else if (type === 'brush') {
      sfx.whoosh();
      say('🧹 ゴシゴシ！', '#90caf9', 22, 1100);
    } else if (type === 'yut') {
      sfx.flip();
      const strong = value >= 4;
      say(`🥢 ${name}！`, strong ? '#ffd54f' : value <= 1 ? '#bdbdbd' : '#fff', strong ? 28 : 22, 1600);
      if (p.type === 'human') later(300, () => toast(`ユンノリ：${name}${value === 5 ? ' ものすごく 強い！' : value === 4 ? ' 強い！' : value === 1 ? ' 弱い…' : ''}`, strong ? '#ffd54f' : '#fff'));
    } else if (type === 'kickback') {
      sfx.boing();
      say('🪶 けり上げ！', '#e53935', 22, 1300);
    } else if (type === 'doll') {
      sfx.rare();
      say(`🪆 中から もう1人！（あと${left}人）`, '#d32f2f', 20, 1600);
    } else if (type === 'pinata') {
      sfx.rare();
      renderer.shake(250, 5);
      say('🎉 割れた！ お菓子と カード！', '#ec407a', 22, 1600);
    } else if (type === 'ink') {
      sfx.whoosh();
      say('墨で ×！', '#212121', 22);
      if (p.type === 'human') later(400, () => toast(`${p.name}は 顔に 墨！ 次は ねらいの線が 見えないよ`, '#424242'));
    } else if (type === 'kite') {
      say('🪁 風に 乗った！', '#29b6f6', 18, 1000);
    } else if (type === 'wind') {
      say('ひゅ〜', '#81d4fa', 16, 800);
    } else if (type === 'topTired') {
      say('回転が 止まった…', '#8d6e63', 18, 1200);
    } else if (type === 'menko') {
      sfx.hit(10);
      say('バシッ！ ひっくり返った！', '#1565c0', 22, 1500);
      later(400, () => toast(`${p.name}は ひっくり返って 次の番 お休み！`, '#1565c0'));
    } else if (type === 'kendama') {
      sfx.hit(6);
      say('もう1回 カツン！', '#c62828', 20);
    } else if (type === 'darumaOff') {
      sfx.hit(8, true);
      say(`段が 抜けた！（残り${left}）`, '#d32f2f', 20);
    } else if (type === 'jiggle') {
      say('ぷるん', '#ffb300', 18, 700);
    } else if (type === 'wobble') {
      sfx.boing();
      say('ぷるぷる〜！', '#ffb300', 22);
      if (p.type === 'human') later(400, () => toast(`${p.name}の プリンが ゆれてる！ 次は ねらいが ブレるかも`, '#ffb300'));
    } else if (type === 'janken') {
      sfx.rare();
      say(value ? '✊ じゃんけん…勝ち！' : '✊ じゃんけん…負け〜', value ? '#43a047' : '#e53935', 22, 1600);
    } else if (type === 'sticky') {
      say('ネバ〜ッ', '#c99a52', 22);
    } else if (type === 'gather') {
      say('🍛 みんな 集まってきた！', '#e65100', 20, 1400);
    } else if (type === 'hanamaru') {
      sfx.rare();
      renderer.addEffect({ type: 'text', x, y, text: '💮', size: 56, dur: 1600 });
      later(500, () => toast(`${p.name}に はなまる！ うれしくて 次の番 動けない💮`, '#e53935'));
    } else if (type === 'charge') {
      sfx.warn();
      toast(`${p.name}の ダイオウケシは ためている…💤`, '#fff');
    } else if (type === 'partOff') {
      sfx.hit(9, true);
      renderer.addEffect({ type: 'text', x, y, text: `パーツが 取れた！（残り${left}）`, color: '#ffca28', stroke: true, size: 20, dur: 1300 });
    } else if (type === 'confuse') {
      sfx.boing();
      renderer.addEffect({ type: 'text', x, y, text: '🍓 混乱！', color: '#ff6f91', stroke: true, size: 24, dur: 1400 });
      if (p.type === 'human') later(400, () => toast(`${p.name}は 混乱！ 次は 反対に飛んじゃうかも`, '#ff6f91'));
    }
  });

  // 机の しかけ（給食の時間：牛乳が こぼれた）
  on('stageFx', ({ type, x, y }) => {
    if (type !== 'spill') return;
    sfx.boing();
    renderer.addEffect({ type: 'text', x, y, text: '🥛 こぼれた！', color: '#ffffff', stroke: true, size: 24, dur: 1400 });
  });

  on('cardFx', ({ type, playerIndex, x, y }) => {
    const p = game.players[playerIndex];
    const say = (text, color, size = 22, dur = 1300) => renderer.addEffect({ type: 'text', x, y, text, color, stroke: true, size, dur });
    if (type === 'charging') {
      say('🔋 ためている…', '#ef5350');
    } else if (type === 'powerReady') {
      sfx.big();
      say('🔋 パワー2倍！', '#ef5350', 24);
    } else if (type === 'jump') {
      sfx.whoosh();
      say('🦘 ジャンプ！', '#10b981');
    } else if (type === 'land') {
      sfx.hit(3);
    } else if (type === 'cushion') {
      sfx.boing();
      say('↩️ ポヨン！', '#ef5350');
    } else if (type === 'pierce') {
      say('🚂 貫き！', '#ef5350');
    } else if (type === 'bowling') {
      sfx.hit(8);
      say('🎳 ストライク！', '#ef5350');
    } else if (type === 'shield') {
      sfx.hold();
      renderer.addEffect({ type: 'ring', x, y, color: '#3b82f6', dur: 500, r: 30, grow: 30 });
      say('🛡️ 筆箱で ガード！', '#3b82f6', 22, 1400);
    } else if (type === 'revive') {
      sfx.rare();
      renderer.addEffect({ type: 'ring', x, y, color: '#ffd54f', dur: 700, r: 20, grow: 60 });
      say(`🔁 ${p.name} もう一回！`, '#f59e0b', 24, 1600);
    } else if (type === 'holeClose') {
      toast('ブラックホールが 閉じた', '#b39ddb');
    }
  });

  on('hold', ({ x, y }) => {
    sfx.hold();
    renderer.addEffect({ type: 'ring', x, y, color: '#4fc3f7', dur: 600, r: 30 });
    renderer.addEffect({ type: 'text', x, y, text: '踏みとどまった！', color: '#4fc3f7', stroke: true, size: 24, dur: 1400 });
  });

  on('card', ({ playerIndex, card, params, target }) => {
    const me = posOf(playerIndex);
    const color = CARD_TYPES[card.type].color;
    sfx.card();
    toast(`${card.icon} ${card.name}！`, color);
    switch (card.id) {
      case 'big':
        sfx.big();
        renderer.addEffect({ type: 'ring', x: me.x, y: me.y, color, dur: 600, r: 40 });
        renderer.shake(250, 4);
        break;
      case 'curve':
        if (game.players[playerIndex].type === 'human') setHint('弾いたあと、画面をなぞると 曲がるよ！');
        break;
      case 'barrier':
      case 'wax':
        renderer.addEffect({ type: 'ring', x: params.x, y: params.y, color: '#fff', dur: 500, r: 30, grow: 80 });
        if (card.id === 'wax') sfx.whoosh();
        break;
      case 'skip':
        later(900, () => toast(`${game.players[target].name}は 次は お休み！`, '#b39ddb'));
        break;
      case 'swap':
      case 'teleport': {
        sfx.whoosh();
        const pts = card.id === 'swap' ? [me, posOf(target)] : [me];
        pts.forEach((q) => renderer.addEffect({ type: 'ring', x: q.x, y: q.y, color, dur: 600, r: 20, grow: 50 }));
        break;
      }
      case 'quake':
        sfx.quake();
        renderer.shake(1100, 7);
        break;
      case 'fan':
        sfx.whoosh();
        later(150, () => sfx.whoosh());
        renderer.addEffect({ type: 'ring', x: me.x, y: me.y, color: '#b3e5fc', dur: 700, r: 30, grow: 300 });
        break;
      case 'guruguru':
        sfx.whoosh();
        currentState().erasers.forEach((q) => {
          if (q.alive) renderer.addEffect({ type: 'text', x: q.x, y: q.y, text: '😵', size: 30, dur: 1200 });
        });
        break;
      case 'fullpower':
        sfx.big();
        renderer.shake(250, 4);
        renderer.addEffect({ type: 'ring', x: me.x, y: me.y, color, dur: 600, r: 30, grow: 70 });
        break;
      case 'mini':
        sfx.whoosh();
        renderer.addEffect({ type: 'ring', x: me.x, y: me.y, color, dur: 500, r: 50, grow: -40 });
        break;
      case 'ruler':
        renderer.addEffect({ type: 'ring', x: params.x, y: params.y, color: '#fff', dur: 500, r: 40, grow: 120 });
        break;
      case 'okawari':
      case 'roulette':
      case 'thief':
        // 新しいカードは newCard で見せる
        break;
      case 'tameuchi':
        sfx.big();
        renderer.addEffect({ type: 'ring', x: me.x, y: me.y, color, dur: 900, r: 50, grow: -40 });
        break;
      case 'invisible':
        sfx.whoosh();
        renderer.addEffect({ type: 'text', x: me.x, y: me.y, text: '🌫️', size: 50, dur: 1200 });
        break;
      case 'pencase':
      case 'extralife':
        renderer.addEffect({ type: 'ring', x: me.x, y: me.y, color, dur: 700, r: 20, grow: 40 });
        break;
      case 'crumbs':
        sfx.crumble();
        renderer.addEffect({ type: 'ring', x: params.x, y: params.y, color: '#a1887f', dur: 500, r: 30, grow: 60 });
        break;
      case 'reverse':
        later(900, () => toast(`${game.players[target].name}は 次は 逆さま！`, '#b39ddb'));
        break;
      case 'shrinkbeam': {
        sfx.whoosh();
        const t = posOf(target);
        renderer.addEffect({ type: 'ring', x: t.x, y: t.y, color, dur: 500, r: 50, grow: -40 });
        break;
      }
      case 'tilt':
        sfx.quake();
        renderer.shake(500, 3);
        break;
      case 'blackout':
        sfx.warn();
        later(900, () => toast('次の ターンは 停電…🔌', '#ffe082'));
        break;
      case 'shuffle':
      case 'seating':
        sfx.whoosh();
        later(150, () => sfx.whoosh());
        renderer.shake(300, 3);
        break;
      case 'blackhole':
        sfx.quake();
        renderer.addEffect({ type: 'ring', x: 0, y: 0, color: '#311b92', dur: 900, r: 200, grow: -180 });
        break;
      case 'hazure':
        later(150, () => sfx.boing());
        renderer.addEffect({ type: 'text', x: me.x, y: me.y, text: '🙃', size: 60, dur: 1600 });
        later(900, () => toast('残念…', '#ffcc80'));
        break;
      default:
        renderer.addEffect({ type: 'ring', x: me.x, y: me.y, color, dur: 600, r: 30 });
    }
  });

  // おかわり：新しいカードが何枚かめくれる
  on('newCard', ({ playerIndex, cards, from, roulette }) => {
    const p = game.players[playerIndex];
    // ひとが はじめて手に入れたカードは NEW＋図鑑へ（CPU・オンラインの相手のおかわりは対象外）
    const human = p.type === 'human';
    const fresh = cards.map((c) => human && !collection.hasSeenCard(c.id));
    if (human) collection.markCardsSeen(cards.map((c) => c.id));
    // 相手のカードがないしょのときは、裏のまま見せる（使うときにめくれる）
    const secret = isSecret(p);
    const ov = openOverlay(`
      <div class="announce">
        <div class="announce-title" style="color:${p.color}">${
          from != null
            ? `🦹 ${esc(p.name)}が ${esc(game.players[from].name)}の カードを 奪った！`
            : roulette
              ? `🎰 ルーレット！ ${esc(p.name)}に 出たのは…`
              : `🎁 ${esc(p.name)}に カード${cards.length}枚！`
        }</div>
        <div class="deal n${cards.length}">${cards
          .map((c, k) =>
            secret
              ? '<div class="flip secret"><div class="card-back"><span>?</span></div></div>'
              : flipCardHTML(c, '', { isNew: fresh[k] }),
          )
          .join('')}</div>
        <div class="announce-note">${secret ? '何が出たかは 内緒…' : cards.length > 1 ? '2枚 いっしょに 使うよ！' : 'すぐに 使えるよ（あとで 使ってもいい）'}</div>
      </div>`);
    ov.querySelectorAll('.flip:not(.secret)').forEach((f, k) => {
      later(350 + k * 450, () => {
        f.classList.add('open');
        sfx.flip();
        if (cards[k].rarity !== 'normal') later(350, () => sfx.rare());
      });
    });
    later(1400 + cards.length * 450, closeOverlay);
  });

  // おかわりの2枚目以降：1枚使うと次のカードが出てくる
  on('nextCard', ({ playerIndex, card, pick }) => {
    const p = game.players[playerIndex];
    // おかわりで 場所や 相手を えらぶカードが 出たら、カードが めくれたあと そのまま えらぶ
    if (pick) {
      if (p.type === 'human' && isMyTurn()) {
        later(2500, () => {
          if (game.canUseCard(playerIndex) && game.players[playerIndex].card.def.id === card.id) beginUse(playerIndex, card);
          else if (game.players[playerIndex].card && !game.players[playerIndex].card.used) setHint(`${card.icon} ${card.name}も 使えるよ！ カードを押してね`);
        });
      }
      return;
    }
    if (!isSecret(p)) later(1000, () => toast(`次のカード：${card.icon} ${card.name}`, CARD_TYPES[card.type].color));
    if (p.type === 'human') setHint('もう1枚カードが使えるよ！');
  });

  on('again', () => {
    updateHud(`${game.players[game.turnIndex].name}：もう1回！`);
    toast('もう1回！', '#ffeb3b');
    if (isMyTurn()) onTurnStart({ again: true });
  });
  on('resume', () => {
    updateHud();
    if (isMyTurn()) onTurnStart({ again: true });
  });
  on('skipped', ({ playerIndex }) => {
    toast(`${game.players[playerIndex].name}は お休み…💤`, '#b39ddb');
  });
  on('shrinkWarn', ({ first }) => {
    sfx.warn();
    if (first) {
      later(700, () => toast('サドンデス！ 机が削れるぞ', '#ff5252'));
    }
  });
  on('shrink', () => {
    sfx.crumble();
    renderer.shake(300, 4);
  });

  // 番が終わった（ここは自分の端末で計算したときだけ来る）
  game.on('turn', () => {
    if (online) commitState();
    updateHud();
    onTurnStart();
  });
  game.on('over', (result) => {
    if (online) commitState();
    showOver(result);
  });

  function showOver(result) {
    if (overShown) return;
    overShown = true;
    $('turn').textContent = '勝負あり！';
    $('turn').style.background = '#444';
    setHint('');
    const w = result.winner;
    later(500, () => {
      if (w == null) sfx.draw();
      else if (game.players[w].type === 'human') sfx.win();
      else sfx.lose();
    });
    later(GAME.resultDelayMs, () => {
      result.replay = replay.finish(); // 試合の ふりかえり（結果画面から 見られる）
      result.turns = game.turnCount;
      result.deskName = desk.name;
      onEnd(result, game.players);
    });
  }

  // ---- オンライン：送る・受けとる ----
  let frameNo = 0;
  let lastFrameAt = 0;
  let streamCleared = false;
  let lastActivity = performance.now(); // さいごに だれかが動いた時間（なにもしない人を見つけるため）

  function sendFrame() {
    if (!online) return;
    const ev = evQueue.splice(0);
    const frame = { seq: online.seq, k: frameNo++, view: packView(game.getState()), ev, at: Date.now() };
    if (!streamCleared) {
      // 自分の番のはじめに、前の人の動きを消してから送る
      streamCleared = true;
      online.session.clearStream().then(() => online.session.pushFrame(frame));
    } else {
      online.session.pushFrame(frame);
    }
  }

  // 番が終わった状態を、みんなに送る
  function commitState() {
    sendFrame();
    online.seq += 1;
    frameNo = 0;
    streamCleared = false;
    online.session.writeState(online.seq, game.exportState());
    lastActivity = performance.now();
  }

  // とどいた状態（ほかの人の番が終わった）
  function applyRemoteState(g) {
    if (!g || !g.state || g.seq <= online.seq) return;
    online.seq = g.seq;
    game.importState(g.state);
    remoteView = null;
    shown.clear();
    frameNo = 0;
    streamCleared = false;
    lastActivity = performance.now();
    endPlacement();
    if (game.phase === 'over') {
      showOver(game.result);
      return;
    }
    updateHud();
    onTurnStart();
  }

  // とどいた動き（ほかの人の番）
  function applyFrame(f) {
    if (!f || f.seq !== online.seq || isMyTurn()) return;
    lastActivity = performance.now();
    remoteView = unpackView(f.view, game.getState());
    for (const e of f.ev || []) {
      const [name, data] = unpackEvent(e);
      if (name === 'flick' || name === 'again') cpuAim = null;
      (remoteHandlers[name] || []).forEach((fn) => fn(data));
    }
  }

  // 画面の消しゴムを、とどいた位置へなめらかに動かす
  function smoothRemote(st) {
    const k = 0.45;
    const move = (e) => {
      const key = e.pid ?? 'j' + e.jid; // 外れたパーツは jid
      const prev = shown.get(key);
      if (prev && e.alive) {
        let da = e.angle - prev.angle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        e.x = prev.x + (e.x - prev.x) * k;
        e.y = prev.y + (e.y - prev.y) * k;
        e.angle = prev.angle + da * k;
      }
      shown.set(key, { x: e.x, y: e.y, angle: e.angle });
    };
    const out = {
      ...st,
      erasers: st.erasers.map((e) => ({ ...e })),
      extras: st.extras.map((e) => ({ ...e })),
      junk: (st.junk || []).map((j) => ({ ...j })),
    };
    out.erasers.forEach(move);
    out.extras.forEach(move);
    out.junk.forEach(move);
    return out;
  }

  // ---- オンライン：スタンプ ----
  let lastStampAt = 0;
  if (online) {
    $('stamps').innerHTML = ONLINE.stamps
      .map((s) => `<button class="stamp" data-id="${s.id}">${s.icon}<span>${s.text}</span></button>`)
      .join('');
    $('stampBtn').addEventListener('click', () => $('stamps').classList.toggle('show'));
    $('stamps').addEventListener('click', (e) => {
      const b = e.target.closest('.stamp');
      if (!b) return;
      $('stamps').classList.remove('show');
      const now = performance.now();
      if (now - lastStampAt < ONLINE.stampCooldownMs) return;
      lastStampAt = now;
      online.session.sendStamp(b.dataset.id);
    });
  }
  function showStamp({ uid, id }) {
    const s = ONLINE.stamps.find((x) => x.id === id);
    const i = online.order.indexOf(uid);
    if (!s) return;
    if (i < 0) {
      // 観戦している人からの 応援
      if (uid !== online.session.uid || spectator) toast(`👀 観客：${s.icon}${s.text}`, '#fff');
      return;
    }
    const p = game.players[i];
    const e = posOf(i);
    sfx.tap();
    if (e && e.alive) {
      renderer.addEffect({ type: 'text', x: e.x, y: e.y - 30, text: `${s.icon}${s.text}`, color: p.color, stroke: true, size: 22, dur: 1800 });
    } else {
      toast(`${p.name}：${s.icon}${s.text}`, p.color);
    }
  }

  // ---- オンライン：通信が切れた人・なにもしない人 ----
  let members = {};
  let offlineSince = 0;
  function checkTimeouts() {
    if (!online || game.phase === 'over' || overShown || isMyTurn()) return;
    const cur = game.turnIndex;
    const m = members[online.order[cur]];
    const gone = !m || m.left || m.online === false;
    const now = performance.now();
    if (gone && !offlineSince) offlineSince = now;
    if (!gone) offlineSince = 0;
    const tooLongOffline = gone && now - offlineSince > (m?.left ? 0 : ONLINE.disconnectSec * 1000);
    const idle = now - lastActivity > ONLINE.idleTurnSec * 1000;
    if (!tooLongOffline && !idle) return;
    // 残っている人のうち、一番前の人が脱落の手つづきをする（2人がいっしょにしないように）
    const manager = online.order.findIndex(
      (uid, i) => i !== cur && game.erasers[i].alive && members[uid] && !members[uid].left && members[uid].online !== false,
    );
    if (manager < 0 || manager !== online.myIndex) return; // 観戦している人（myIndex -1）は なにもしない
    offlineSince = 0;
    lastActivity = now;
    game.eliminate(cur); // → 'turn' か 'over' が来て、状態がみんなに送られる
  }

  if (online) {
    online.session.watchGame(applyRemoteState);
    online.session.watchFrames(applyFrame);
    online.session.watchStamps(showStamp);
    // 参加者だけ見る（部屋ぜんぶを見ると、トーナメントでは ほかの試合の動きまで とどいてしまう）
    online.session.watchMembers((m) => {
      members = m || {};
    });
    const iv = setInterval(checkTimeouts, 1000);
    timers.add(iv);
  }

  // ---- やめるボタン（まちがえて押さないように2回押し） ----
  let quitArmed = false;
  $('quit').addEventListener('click', () => {
    if (quitArmed) return onQuit();
    quitArmed = true;
    $('quit').textContent = 'もう一回押すとやめる';
    later(2500, () => {
      quitArmed = false;
      $('quit').textContent = 'やめる';
    });
  });

  // ---- カメラ：大きい机の自動ズーム ＋ 落ちたときのスロー＆ズーム ----
  const ease = (t) => t * t * (3 - 2 * t);
  let baseCam = { x: 0, y: 0, zoom: 1 };

  function updateBaseCam() {
    if (!desk.autoCamera) return;
    if (input.drag || input.steerDrag) return; // 指で操作している間は動かさない
    const ac = GAME.autoCamera;
    let target = { x: 0, y: 0, zoom: 1 }; // 置く場所・相手をえらぶときは机ぜんたい
    if (!input.placement && !input.targeting) {
      const alive = currentState().erasers.filter((e) => e.alive);
      if (alive.length) {
        const xs = alive.map((e) => e.x);
        const ys = alive.map((e) => e.y);
        const m = ac.margin;
        target = renderer.fitCamera(
          Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m, ac.maxZoom,
        );
      }
    }
    const k = ac.follow;
    baseCam = {
      x: baseCam.x + (target.x - baseCam.x) * k,
      y: baseCam.y + (target.y - baseCam.y) * k,
      zoom: baseCam.zoom + (target.zoom - baseCam.zoom) * k,
    };
  }

  function updateCamera(now) {
    updateBaseCam();
    if (slow && now - slow.start > GAME.slowmo.durationMs) slow = null;
    if (!slow) {
      renderer.setCamera(baseCam.x, baseCam.y, baseCam.zoom);
      return 1;
    }
    const { durationMs: D, zoom, timeScale } = GAME.slowmo;
    const t = now - slow.start;
    const f = t < 250 ? ease(t / 250) : t > D - 300 ? ease((D - t) / 300) : 1;
    const e = posOf(slow.idx);
    const z = Math.max(zoom, baseCam.zoom * 1.4);
    renderer.setCamera(
      baseCam.x + (e.x - baseCam.x) * f,
      baseCam.y + (e.y - baseCam.y) * f,
      baseCam.zoom + (z - baseCam.zoom) * f,
    );
    return timeScale;
  }

  // ---- ループ ----
  const STEP = PHYSICS.timeStep;
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    if (destroyed) return;
    const timeScale = updateCamera(now);
    acc += Math.min(now - last, 250) * timeScale;
    last = now;

    // CPU のカーブ：ねらった相手のほうへ曲げる
    const cur = game.players[game.turnIndex];
    if (cur.type === 'cpu' && game.canSteer(game.turnIndex) && cpuSteerTarget >= 0) {
      const me = posOf(game.turnIndex);
      const t = posOf(cpuSteerTarget);
      if (t.alive) game.steer(game.turnIndex, t.x - me.x, t.y - me.y);
    }

    if (isMyTurn()) {
      // 自分で計算する（オンラインでは、自分の番のときだけ）
      let n = 0;
      while (acc >= STEP && n < 10) {
        game.step(STEP);
        acc -= STEP;
        n++;
      }
      // オンライン：動いている間・できごとがあったときは、みんなに送る
      if (online && game.phase !== 'over') {
        const moving = game.phase !== 'aim' || evQueue.length;
        if (moving && now - lastFrameAt >= ONLINE.frameMs) {
          lastFrameAt = now;
          lastActivity = now;
          sendFrame();
        }
      }
    } else {
      acc = 0;
    }

    refreshCardBtn();
    const st = online && !isMyTurn() && remoteView ? smoothRemote(remoteView) : game.getState();
    st.viewer = viewerIndex; // とうめい（カード）：自分のは うすく見える
    st.online = !!online;
    // せきがえ中は、もう決めた場所を いつも見せる（さわっていないときも）
    let preview = input.preview;
    const seat = input.placement?.kind === 'seat' ? input.placement : null;
    if (seat && !preview) {
      preview = {
        kind: 'eraser', chosenOnly: true,
        chosen: seat.chosen.map((c) => {
          const o = game.pieceByPid(c.pid);
          return { x: c.x, y: c.y, angle: o.body.angle, def: o.def, size: o.size };
        }),
      };
    }
    if (seat) st.seatMoved = seat.chosen.map((c) => c.pid); // 元の場所は うすくする
    renderer.draw(st, input.aim || cpuAim, now, preview, input.targeting?.candidates);
    replay.frame(now, st, input.aim || cpuAim, renderer.cam, renderer.flip);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // ---- 先攻・後攻のルーレット ----
  function showRoulette(done) {
    const ps = game.players;
    const n = ps.length;
    const seg = 360 / n;
    const winner = game.turnIndex; // ルーレットの前に決まっている（オンラインでは みんな同じ）
    const nameOf = (p, i) => (online && i === online.myIndex ? 'あなた' : p.name);
    const grad = ps.map((p, i) => `${p.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ');
    const ov = openOverlay(`
      <div class="roulette-box">
        <div class="roulette-title">${n === 2 ? 'どっちが 先？' : 'だれが 先？'}</div>
        <div class="roulette">
          <div class="roulette-pointer"></div>
          <div class="roulette-wheel" style="background: conic-gradient(${grad})">
            ${ps
              .map(
                (p, i) => `<div class="roulette-label" style="transform: rotate(${(i + 0.5) * seg}deg)"><span>${esc(nameOf(p, i))}</span></div>`,
              )
              .join('')}
          </div>
          <div class="roulette-hub">?</div>
        </div>
        <div class="roulette-result"></div>
      </div>`);
    const wheel = ov.querySelector('.roulette-wheel');
    // 止まる角度：当たりの部分のまん中あたりが、上の▼に来るように（すこしずらして本物っぽく）
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const end = 360 * 3 - (winner + 0.5) * seg + jitter;
    const SPIN_MS = 1300; // 回っている時間（止まって結果を見せる 0.7秒と合わせて 約2秒）
    let finished = false;
    let lastSeg = -1;
    let tickRaf = 0;
    // まわっている間、しきりを通るたびに カチッ
    const tick = () => {
      const m = getComputedStyle(wheel).transform;
      if (m && m !== 'none') {
        const [a, b] = m.slice(7, -1).split(',').map(Number);
        const deg = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
        const s = Math.floor(((360 - deg) % 360) / seg);
        if (s !== lastSeg) {
          if (lastSeg >= 0) sfx.tap();
          lastSeg = s;
        }
      }
      if (!finished) tickRaf = requestAnimationFrame(tick);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(tickRaf);
      const p = ps[winner];
      ov.querySelector('.roulette-hub').textContent = '!';
      const res = ov.querySelector('.roulette-result');
      res.innerHTML = `<b style="color:${p.color}">${esc(nameOf(p, winner))}</b> の 先攻！`;
      res.classList.add('show');
      sfx.rare();
      later(700, () => {
        closeOverlay();
        done();
      });
    };
    requestAnimationFrame(() => {
      wheel.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.18, 1)`;
      wheel.style.transform = `rotate(${end}deg)`;
      tickRaf = requestAnimationFrame(tick);
    });
    wheel.addEventListener('transitionend', finish, { once: true });
    later(SPIN_MS + 300, finish); // 画面がかくれていて transitionend が来ないときも すすむ
  }

  // オンラインで、自分の席が むこうがわなら 机を180度回して、自分を手前（画面の下）にする
  if (online && online.myIndex >= 0 && game.isFarSeat(online.myIndex)) {
    renderer.flip = true;
    renderer.resize(desk);
  }

  updateHud();
  if (game.phase === 'over') showOver(game.result);
  else if (game.turnCount === 1 && game.time === 0 && game.players.length > 1) {
    // ルーレットが止まるまで、左上の「○○のばん」で答えがわからないようにする
    $('turn').textContent = '🎡 だれが 先？';
    $('turn').style.background = '#888';
    showRoulette(() => {
      updateHud();
      onTurnStart();
    });
  } else onTurnStart();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      timers.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
      timers.clear();
      ro.disconnect();
      input.detach();
      online?.session.stopAll();
    },
  };
}
