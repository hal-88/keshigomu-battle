// オンラインの画面：メニュー（なまえ・消しゴム）→ へやをつくる／あいことばで入る → まちあい室 → カード → 対戦 → 結果
// 画面の部品（screen など）は main.js からもらう。

import { DESKS, findDesk } from './config/desks.js';
import { findEraser, REGULAR_ERASERS } from './config/erasers.js';
import { drawRandomCard, findCard } from './config/cards.js';
import { GAME } from './config/game.js';
import { ONLINE } from './config/online.js';
import { Game } from './logic/Game.js';
import { createBattle } from './battle.js';
import { drawEraserPreview } from './render/drawEraser.js';
import { flipCardHTML } from './ui/cardView.js';
import { collection } from './progress/collection.js';
import { sfx } from './audio/sfx.js';
import { resultActionsHTML, bindResultActions } from './replay/replayUI.js';
const plain = (h) => String(h).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
import { rewardsHTML } from './ui/rewardView.js';
import { RoomSession, createRoom, joinRoom, getDb, isTestMode, sortedMembers, roomCapacity } from './online/room.js';
import { startRandomMatch } from './online/matchQueue.js';
import { makeBracket, bracketSize } from './tournament/bracket.js';
import { setupTourScreens } from './tourScreens.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param ui main.js の部品 { screen, whenFonts, showTitle, showModeSelect, showEraserSelect, setBattle }
 */
export function setupOnline(ui) {
  const { screen, whenFonts } = ui;
  const st = {
    name: '',
    eraserId: null,
    deskId: DESKS[0].id,
  };
  try {
    st.name = localStorage.getItem('keshigomu-online-name') || '';
  } catch {
    /* なくてもよい */
  }

  // トーナメントの画面（待合室から スタートしたら こちらへ）
  const tours = setupTourScreens(ui, {
    showLobby: (session) => showLobby(session),
    showMenu: (msg) => showMenu(msg),
  });

  // ---------- 招待リンク（LINE などで 送る。タップすると その部屋に 入れる） ----------
  function inviteUrl(code) {
    const u = new URL(location.href);
    const keep = u.searchParams.has('local'); // テストモードは そのまま
    u.search = '';
    u.hash = '';
    u.searchParams.set('room', code);
    if (keep) u.searchParams.set('local', '');
    return u.toString().replace('local=', 'local');
  }
  async function shareInvite(code, el) {
    const url = inviteUrl(code);
    const text = `消しゴムバトルで あそぼう！ 合言葉は ${code}。リンクを タップすると 部屋に 入れるよ`;
    if (navigator.share) {
      try {
        await navigator.share({ title: '消しゴムバトル', text, url });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    // 共有メニューが ない 端末：リンクを コピー
    const ov = document.createElement('div');
    ov.className = 'overlay fixed show';
    ov.innerHTML = `<div class="modal invite-modal">
        <div class="invite-head">📨 友だちを さそう</div>
        <p class="note">このリンクを 送ると、タップするだけで 部屋に 入れるよ</p>
        <input class="invite-url" readonly value="${esc(url)}">
        <div class="row">
          <button class="btn primary" data-act="copy">リンクを コピー</button>
          <button class="btn ghost" data-act="close">閉じる</button>
        </div>
      </div>`;
    el.appendChild(ov);
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-act=close]')) ov.remove();
    });
    ov.querySelector('[data-act=copy]').onclick = async (e) => {
      const btn = e.currentTarget;
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      } catch {
        const inp = ov.querySelector('.invite-url');
        inp.select();
        document.execCommand?.('copy');
      }
      btn.textContent = 'コピーしたよ！';
    };
  }

  const testBadge = () =>
    isTestMode()
      ? '<p class="test-badge">🧪 テストモード：このパソコンの 別のタブと 対戦できるよ（Firebase の設定前）</p>'
      : '';

  // ---------- メニュー ----------
  function showMenu(message = '') {
    const owned = collection.ownedErasers();
    if (!st.eraserId || !collection.owns(st.eraserId)) st.eraserId = owned[0].id;
    const eraser = findEraser(st.eraserId);
    const invite = st.inviteCode;
    const el = screen(
      `<h2 class="head">🌐 オンライン</h2>
       ${testBadge()}
       ${invite ? `<div class="invite-banner">📨 合言葉 <b>${esc(invite)}</b> の 部屋に さそわれたよ！<br><small>名前を 入れて「この部屋に 入る」を 押してね</small></div>` : ''}
       <div class="online-card">
         <label class="online-label">名前（ニックネーム・${ONLINE.nameMaxLength}文字まで）
           <input class="slot-name online-name" maxlength="${ONLINE.nameMaxLength}" value="${esc(st.name)}" autocomplete="off" enterkeyhint="done">
         </label>
         <p class="note warn">⚠ 本当の名前（本名）は 入れないでね</p>
         <div class="online-eraser">
           <canvas class="online-eraser-cv"></canvas>
           <div><small>使う消しゴム</small><br><b>${eraser.name}</b></div>
           <button class="btn small" data-act="eraser">変える</button>
         </div>
       </div>
       ${message ? `<p class="error-msg">${esc(message)}</p>` : ''}
       ${
         invite
           ? `<div class="row">
                <button class="btn big primary" data-act="joinInvite">この部屋に 入る</button>
              </div>
              <button class="btn ghost" data-act="noInvite">ほかの 遊び方</button>`
           : `<button class="btn big random-match" data-act="random">🎲 ランダムマッチ<small>（だれかと 1対1。60秒 さがすよ）</small></button>
              <div class="row">
                <button class="btn big primary" data-act="create">部屋を 作る</button>
                <button class="btn big" data-act="join">合言葉で 入る</button>
              </div>
              <button class="btn big tour-create" data-act="createTour">🏆 トーナメントの 部屋を 作る<small>（16人まで。足りない分は CPU）</small></button>
              <button class="btn ghost" data-act="back">戻る</button>`
       }`,
    );
    whenFonts(() => drawEraserPreview(el.querySelector('.online-eraser-cv'), eraser));
    const nameInput = el.querySelector('.online-name');
    nameInput.addEventListener('input', () => {
      st.name = nameInput.value;
      try {
        localStorage.setItem('keshigomu-online-name', st.name);
      } catch {
        /* なくてもよい */
      }
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nameInput.blur();
    });
    const needName = () => {
      if (st.name.trim()) return true;
      showMenu('名前を 入れてね');
      return false;
    };
    el.querySelector('[data-act=eraser]').onclick = () =>
      ui.showEraserSelect({
        title: 'オンラインで 使う消しゴム',
        selectedId: st.eraserId,
        goLabel: 'これにする',
        onPick: (id) => {
          st.eraserId = id;
          showMenu();
        },
        onBack: () => showMenu(),
      });
    // さそわれた 部屋に 入る
    el.querySelector('[data-act=joinInvite]')?.addEventListener('click', async () => {
      if (!needName()) return;
      const code = st.inviteCode;
      try {
        loading('部屋を 探しているよ…');
        await joinRoom(code, { name: st.name, eraserId: st.eraserId, wins: collection.tournamentWins() });
        st.inviteCode = null;
        await openLobby(code);
      } catch (err) {
        st.inviteCode = null;
        showMenu(`${errorText(err)}（合言葉 ${code}）`);
      }
    });
    el.querySelector('[data-act=noInvite]')?.addEventListener('click', () => {
      st.inviteCode = null;
      showMenu();
    });
    if (invite) return;
    el.querySelector('[data-act=create]').onclick = async () => {
      if (!needName()) return;
      try {
        loading('部屋を 作っているよ…');
        const code = await createRoom({ name: st.name, eraserId: st.eraserId, deskId: st.deskId, wins: collection.tournamentWins() });
        await openLobby(code);
      } catch (err) {
        showMenu(errorText(err));
      }
    };
    el.querySelector('[data-act=createTour]').onclick = async () => {
      if (!needName()) return;
      try {
        loading('トーナメントの 部屋を 作っているよ…');
        const code = await createRoom({ name: st.name, eraserId: st.eraserId, deskId: st.deskId, mode: 'tournament', wins: collection.tournamentWins() });
        await openLobby(code);
      } catch (err) {
        showMenu(errorText(err));
      }
    };
    el.querySelector('[data-act=join]').onclick = () => {
      if (needName()) showJoin();
    };
    el.querySelector('[data-act=random]').onclick = () => {
      if (needName()) showRandomSearch();
    };
    el.querySelector('[data-act=back]').onclick = ui.showModeSelect;
  }

  function errorText(err) {
    const m = String(err?.message || err);
    if (/permission|PERMISSION/i.test(m)) return '通信が 許されていないよ（Firebase のルールを 確かめてね）';
    if (/network|offline|Failed to fetch/i.test(m)) return 'インターネットに つながっていないみたい';
    return m;
  }

  function loading(text) {
    screen(`<div class="loading"><div class="spinner"></div><p>${text}</p></div>`);
  }

  // ---------- あいことばを入れる ----------
  function showJoin(message = '') {
    let code = '';
    const el = screen(
      `<h2 class="head">合言葉を 入れてね</h2>
       ${testBadge()}
       <div class="code-display" data-el="code"></div>
       ${message ? `<p class="error-msg">${esc(message)}</p>` : ''}
       <div class="keypad">
         ${[1, 2, 3, 4, 5, 6, 7, 8, 9, '消す', 0, 'OK']
           .map((k) => `<button class="key ${typeof k === 'number' ? '' : 'fn'}" data-k="${k}">${k}</button>`)
           .join('')}
       </div>
       <button class="btn ghost" data-act="back">戻る</button>`,
    );
    const disp = el.querySelector('[data-el=code]');
    const render = () => {
      disp.innerHTML = Array.from({ length: ONLINE.codeDigits }, (_, i) => `<span>${code[i] ?? ''}</span>`).join('');
    };
    render();
    const submit = async () => {
      if (code.length !== ONLINE.codeDigits) return;
      try {
        loading('部屋を 探しているよ…');
        await joinRoom(code, { name: st.name, eraserId: st.eraserId, wins: collection.tournamentWins() });
        await openLobby(code);
      } catch (err) {
        showJoin(errorText(err));
      }
    };
    el.querySelectorAll('.key').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.k;
        if (k === '消す') code = code.slice(0, -1);
        else if (k === 'OK') return submit();
        else if (code.length < ONLINE.codeDigits) code += k;
        render();
        if (code.length === ONLINE.codeDigits) submit();
      };
    });
    el.querySelector('[data-act=back]').onclick = () => showMenu();
  }

  // ---------- まちあい室 ----------
  async function openLobby(code) {
    const session = await RoomSession.open(code);
    showLobby(session);
  }

  function showLobby(session) {
    tours.leaveAll(); // トーナメントから もどったとき
    const el = screen(
      `<h2 class="head" data-el="title">待合室</h2>
       ${testBadge()}
       <div class="lobby-code">
         <small>合言葉</small>
         <div class="big-code">${session.code}</div>
         <small>この 数字を 友だちに 教えてね</small>
       </div>
       <div class="lobby-members" data-el="members"></div>
       <div class="lobby-desk" data-el="desk"></div>
       <p class="note" data-el="status"></p>
       <div class="row">
         <button class="btn ghost" data-act="leave">部屋を 出る</button>
         <button class="btn" data-act="changeEraser">🔄 消しゴムを 変える</button>
         <button class="btn" data-act="invite">📨 友だちを さそう</button>
         <button class="btn big primary hidden" data-act="start">スタート！</button>
       </div>`,
      'lobby-screen',
    );
    const $ = (n) => el.querySelector(`[data-el=${n}]`);
    el.querySelector('[data-act=invite]').onclick = () => shareInvite(session.code, el);
    let room = null;
    let gone = false;
    let starting = false;

    const stopWatch = session.watchRoom((r) => {
      if (gone) return;
      room = r;
      if (!room || !room.meta) {
        gone = true;
        session.stopAll();
        showMenu('部屋が なくなったよ');
        return;
      }
      // トーナメントが はじまったら、トーナメント表へ
      if (room.meta.status === 'tournament' && room.tour?.tid && room.tour.tid !== session.lastTid) {
        gone = true;
        stopWatch();
        session.lastTid = room.tour.tid;
        tours.enter(session);
        return;
      }
      // 対戦がはじまったら、カードの画面へ（前の試合とまちがえないように gid でたしかめる）
      if (room.meta.status === 'playing' && room.game?.gid && room.game.gid !== session.lastGid) {
        gone = true;
        stopWatch();
        session.lastGid = room.game.gid;
        showDeal(session, room);
        return;
      }
      renderLobby();
    });

    function renderLobby() {
      const members = sortedMembers(room);
      const hostUid = members[0]?.uid;
      const amHost = hostUid === session.uid;
      const isTour = room.meta.mode === 'tournament';
      const cap = roomCapacity(room.meta);
      el.classList.toggle('tour-lobby', isTour);
      $('title').textContent = isTour ? '🏆 トーナメントの 待合室' : '待合室';
      $('members').innerHTML = members
        .map(
          (m, i) => `
          <div class="lobby-member ${m.online === false ? 'offline' : ''}" style="--c:${GAME.playerColors[i] || '#999'}">
            <canvas data-id="${esc(m.eraserId)}"></canvas>
            <div class="lm-name">${i === 0 ? '👑 ' : ''}${esc(m.name)}${m.wins ? ` <span class="name-trophy">🏆${m.wins}</span>` : ''}${m.uid === session.uid ? ' <small>（あなた）</small>' : ''}</div>
            <div class="lm-eraser">${esc(findEraser(m.eraserId)?.name || '')}</div>
          </div>`,
        )
        .join('') + Array.from({ length: Math.max(0, (isTour ? Math.min(cap, members.length <= 8 ? 8 : 16) : cap) - members.length) }, () => `<div class="lobby-member empty">${isTour ? '🤖 CPU' : '空き'}</div>`).join('');
      whenFonts(() =>
        $('members').querySelectorAll('canvas').forEach((c) => {
          const d = findEraser(c.dataset.id);
          if (d) drawEraserPreview(c, d);
        }),
      );
      const deskId = room.meta.deskId;
      if (isTour) {
        const size = bracketSize(members.length);
        $('desk').innerHTML = `<b>${members.length}人</b> → <b>${size}人制</b> トーナメント（CPU ${size - members.length}人）<br><small>机は 試合ごとに ランダム。9人から 16人制になるよ</small>`;
      } else $('desk').innerHTML = amHost
        ? `<small>机（タップで 変えられる）</small><div class="desk-pick">${DESKS.map(
            (d) => `<button class="desk-pick-btn ${d.id === deskId ? 'on' : ''}" data-id="${d.id}">${d.name}</button>`,
          ).join('')}</div>`
        : `<small>机</small><div><b>${findDesk(deskId)?.name || ''}</b></div>`;
      $('desk').querySelectorAll('.desk-pick-btn').forEach((b) => {
        b.onclick = () => session.setDesk(b.dataset.id);
      });
      const enough = members.length >= ONLINE.minPlayers;
      void cap;
      const startBtn = el.querySelector('[data-act=start]');
      startBtn.classList.toggle('hidden', !amHost);
      startBtn.disabled = !enough || starting;
      $('status').textContent = amHost
        ? enough
          ? 'みんな そろったら スタートを 押してね'
          : '友だちが 入ってくるのを 待ってね'
        : '👑 の人が スタートを 押すのを 待ってね';
    }

    el.querySelector('[data-act=start]').onclick = async () => {
      if (!room || starting) return;
      starting = true;
      renderLobby();
      try {
        if (room.meta.mode === 'tournament') {
          await startTournament(session, room);
          return;
        }
        await startMatch(session, room);
      } catch (err) {
        starting = false;
        $('status').textContent = errorText(err);
      }
    };
    el.querySelector('[data-act=leave]').onclick = async () => {
      gone = true;
      await session.leave();
      showMenu();
    };

    // まちあい室のまま、消しゴムをえらびなおす（スタートされたら、そのままカードの画面へ進む）
    el.querySelector('[data-act=changeEraser]').onclick = () => {
      const owned = collection.ownedErasers();
      const ov = document.createElement('div');
      ov.className = 'overlay fixed show';
      ov.innerHTML = `
        <div class="modal eraser-picker">
          <div class="detail-name">使う消しゴムを 選んでね</div>
          <div class="picker-grid">
            ${owned
              .map(
                (e) => `
              <button class="picker-item r-${e.rarity || 'normal'} ${e.id === st.eraserId ? 'on' : ''}" data-id="${e.id}">
                <canvas></canvas>
                <span>${collection.isFavorite(e.id) ? '★' : ''}${e.name}</span>
              </button>`,
              )
              .join('')}
          </div>
          <button class="btn" data-act="close">閉じる</button>
        </div>`;
      el.appendChild(ov);
      whenFonts(() =>
        ov.querySelectorAll('.picker-item').forEach((b) => drawEraserPreview(b.querySelector('canvas'), findEraser(b.dataset.id))),
      );
      ov.addEventListener('click', (ev) => {
        const item = ev.target.closest('.picker-item');
        if (item) {
          st.eraserId = item.dataset.id;
          session.updateMe({ eraserId: st.eraserId }); // みんなの まちあい室にも すぐ反映される
          sfx.tap();
          ov.remove();
          return;
        }
        if (ev.target === ov || ev.target.closest('[data-act=close]')) ov.remove();
      });
    };
  }

  /** 対戦を はじめる（部屋を 作った人）：ならび順・カード・最初の状態を 部屋に 書く */
  async function startMatch(session, room) {
    const members = sortedMembers(room).slice(0, ONLINE.maxPlayers);
    const order = members.map((m) => m.uid);
    const players = members.map((m, i) => ({
      name: m.name,
      type: 'remote',
      eraser: findEraser(m.eraserId) || findEraser('white-standard'),
      color: GAME.playerColors[i],
      card: drawRandomCard(),
    }));
    // 先攻は へやを作った人の端末で決めて、みんなに送る（ルーレットは みんな同じ結果になる）
    const firstTurn = Math.floor(Math.random() * players.length);
    const game = new Game({ desk: findDesk(room.meta.deskId), players, firstTurn });
    await session.start(order, game.exportState());
  }

  // ---------- 🎲 ランダムマッチ ----------
  let searching = null; // さがしている 間の { cancel }
  function showRandomSearch() {
    const el = screen(
      `<h2 class="head">🎲 ランダムマッチ</h2>
       ${testBadge()}
       <div class="loading random-search"><div class="spinner"></div>
         <p>相手を さがしているよ…</p>
         <p class="random-left" data-el="left">${ONLINE.randomWaitSec}</p>
       </div>
       <p class="note">相手の 名前は 出ないよ（「相手」と 出る）。スタンプだけ 送れるよ</p>
       <button class="btn ghost" data-act="cancel">やめる</button>`,
    );
    const left = el.querySelector('[data-el=left]');
    searching = startRandomMatch({
      name: st.name,
      eraserId: st.eraserId,
      wins: collection.tournamentWins(),
      onTick: (sec) => {
        left.textContent = sec;
      },
      onMatched: ({ code, host }) => {
        searching = null;
        openRandomRoom(code, host);
      },
      onTimeout: () => {
        searching = null;
        showMenu('今は 相手が いないよ。また ためしてね');
      },
      onError: (err) => {
        searching = null;
        showMenu(errorText(err));
      },
    });
    el.querySelector('[data-act=cancel]').onclick = async () => {
      const s = searching;
      searching = null;
      showMenu();
      await s?.cancel();
    };
  }

  /** 相手が 見つかった：少し 見せてから 自動で はじめる（部屋を 作った人が スタートする） */
  async function openRandomRoom(code, host) {
    const session = await RoomSession.open(code);
    session.random = true;
    const el = screen(
      `<h2 class="head">🎲 相手が 見つかった！</h2>
       <div class="vs online-vs random-vs" data-el="vs"></div>
       <p class="note" data-el="status">まもなく スタート！</p>`,
    );
    const $ = (n) => el.querySelector(`[data-el=${n}]`);
    let done = false;
    let drawn = false;
    let started = false;
    const startAt = Date.now() + ONLINE.randomStartMs;
    const finish = (msg) => {
      if (done) return;
      done = true;
      clearTimeout(giveUp);
      session.leave();
      showMenu(msg);
    };
    // 相手が いなくなって はじまらない ときは あきらめる
    const giveUp = setTimeout(
      () => finish('相手が いなくなったよ。もう一度 さがしてね'),
      ONLINE.randomStartMs + ONLINE.randomJoinWaitSec * 1000,
    );
    session.watchRoom(async (room) => {
      if (done) return;
      if (!room?.meta) {
        finish('相手が いなくなったよ。もう一度 さがしてね');
        return;
      }
      if (room.meta.status === 'playing' && room.game?.gid && room.game.gid !== session.lastGid) {
        done = true;
        clearTimeout(giveUp);
        session.stopAll();
        session.lastGid = room.game.gid;
        showDeal(session, room);
        return;
      }
      const members = sortedMembers(room);
      if (!drawn && members.length >= 2) {
        drawn = true;
        $('vs').innerHTML = members
          .slice(0, 2)
          .map(
            (m, i) => `${i ? '<div class="vs-mark">VS</div>' : ''}
            <div class="vs-side">
              <canvas class="vs-eraser small" data-id="${esc(m.eraserId)}"></canvas>
              <div class="vs-name"><b style="color:${GAME.playerColors[i]}">${m.uid === session.uid ? esc(m.name) + '（あなた）' : '相手'}</b><br>${esc(findEraser(m.eraserId)?.name || '')}</div>
            </div>`,
          )
          .join('');
        whenFonts(() =>
          $('vs').querySelectorAll('canvas').forEach((c) => drawEraserPreview(c, findEraser(c.dataset.id) || findEraser('white-standard'))),
        );
      }
      // 部屋を 作った人が、少し 待ってから スタート
      if (host && !started && members.length >= 2 && room.meta.status === 'lobby') {
        started = true;
        await new Promise((r) => setTimeout(r, Math.max(0, startAt - Date.now())));
        if (done) return;
        try {
          await startMatch(session, (await session.db.get(`rooms/${session.code}`)) || room);
        } catch (err) {
          finish(errorText(err));
        }
      }
    });
  }

  /** トーナメントを はじめる（まとめ役）：表を作って 部屋に書く */
  async function startTournament(session, room) {
    const members = sortedMembers(room).slice(0, ONLINE.tournamentMaxPlayers);
    const humans = members.map((m) => ({
      name: m.name,
      type: 'human',
      uid: m.uid,
      wins: m.wins || 0,
      eraserId: findEraser(m.eraserId) ? m.eraserId : 'white-standard',
    }));
    // CPU は みんな ちがう消しゴム（人と同じものも さける）
    const used = new Set(humans.map((h) => h.eraserId));
    const pool = REGULAR_ERASERS.filter((e) => !used.has(e.id));
    const makeCpu = (k) => {
      const e = pool.splice(Math.floor(Math.random() * pool.length), 1)[0] || REGULAR_ERASERS[k % REGULAR_ERASERS.length];
      return { name: `CPU${k + 1}`, type: 'cpu', eraserId: e.id };
    };
    const br = makeBracket(humans, makeCpu, bracketSize(humans.length));
    const tid = Math.random().toString(36).slice(2, 10);
    const cup = `${members[0]?.name || 'オンライン'}杯`; // 大会の名前（部屋を作った人の名前）
    await session.startTournament({ tid, cup, size: br.size, entries: br.entries, rounds: br.rounds, at: session.db.now() });
  }

  // ---------- カードをくばる（自分のカードだけ見える） ----------
  function playersFrom(session, room, g) {
    const members = room.members || {};
    return g.order.map((uid, i) => {
      const piece = g.state.pieces.find((p) => p.pi === i && !p.extra);
      return {
        // ランダムマッチでは 相手の 名前は 出さない（知らない人なので）
        name: room.meta?.random && uid !== session.uid ? '相手' : members[uid]?.name || '？',
        type: uid === session.uid ? 'human' : 'remote',
        eraser: findEraser(piece?.defId) || findEraser('white-standard'),
        color: GAME.playerColors[i],
        card: findCard(g.state.players[i]?.cardId) || null,
      };
    });
  }

  function showDeal(session, room) {
    const g = room.game;
    const myIndex = g.order.indexOf(session.uid);
    if (myIndex < 0) {
      showMenu('この 対戦には 入れなかったよ（間に合わなかった）');
      return;
    }
    const players = playersFrom(session, room, g);
    collection.markSeen(players.map((p) => p.eraser.id));
    const mine = players[myIndex];
    const isNew = mine.card && !collection.hasSeenCard(mine.card.id);
    if (mine.card) collection.markCardsSeen([mine.card.id]);

    const el = screen(
      `<div class="streak-head">
         <span class="streak-round">🌐 オンライン 対戦</span>
         <div class="vs online-vs">
           ${players
             .map(
               (p, i) => `
             ${i ? '<div class="vs-mark">VS</div>' : ''}
             <div class="vs-side">
               <canvas class="vs-eraser small" data-id="${p.eraser.id}"></canvas>
               <div class="vs-name" style="color:${p.color}"><b style="color:${p.color}">${esc(p.name)}</b><br>${p.eraser.name}</div>
             </div>`,
             )
             .join('')}
         </div>
       </div>
       <h2 class="head">能力カード</h2>
       <p class="deal-note">相手のカードは 内緒。使うまで 分からないよ</p>
       <div class="deal n2">
         <div class="deal-slot">
           <div class="deal-name" style="background:${mine.color}">あなた</div>
           ${mine.card ? flipCardHTML(mine.card, '', { isNew }) : ''}
         </div>
       </div>
       <button class="btn big primary hidden" data-act="go">戦う！</button>`,
      'deal-screen',
    );
    whenFonts(() => el.querySelectorAll('.vs-eraser').forEach((c) => drawEraserPreview(c, findEraser(c.dataset.id))));
    const flip = el.querySelector('.flip');
    const go = el.querySelector('[data-act=go]');
    const open = () => {
      if (!flip || flip.classList.contains('open')) return;
      flip.classList.add('open');
      sfx.flip();
      if (mine.card.rarity !== 'normal') setTimeout(() => sfx.rare(), 350);
      if (isNew) setTimeout(() => sfx.card(), 450);
      go.classList.remove('hidden');
    };
    flip?.addEventListener('click', open);
    const t = setTimeout(open, 900);
    if (!flip) go.classList.remove('hidden');
    go.onclick = async () => {
      clearTimeout(t);
      // おしたときの いちばん新しい状態から はじめる（もう だれかが弾いているかもしれない）
      const latest = (await session.db.get(`rooms/${session.code}/game`)) || g;
      const r2 = (await session.db.get(`rooms/${session.code}`)) || room;
      startBattle(session, r2, latest, myIndex);
    };
  }

  // ---------- 対戦 ----------
  function startBattle(session, room, g, myIndex) {
    const players = playersFrom(session, room, g);
    const el = screen('', 'battle-screen');
    ui.setBattle(
      createBattle(el, {
        desk: findDesk(room.meta.deskId),
        players,
        label: '🌐',
        online: { session, myIndex, order: g.order, seq: g.seq, state: g.state },
        onEnd: (result, ps) => showResult(session, result, ps, myIndex),
        onQuit: async () => {
          await session.leave();
          ui.showTitle();
        },
      }),
    );
  }

  // ---------- 結果 ----------
  function showResult(session, result, players, myIndex) {
    const w = result.winner;
    let headline;
    let cls;
    if (w == null) {
      headline = '引き分け！';
      cls = 'draw';
    } else if (w === myIndex) {
      headline = '勝ち！';
      cls = 'win';
    } else {
      headline = `${esc(players[w].name)}の<br>勝ち！`;
      cls = 'lose named';
    }
    // ごほうび：オンラインも「5戦するごとに かならずチケット」に数える（消しゴムは手に入らない）
    const reward = collection.finishMatch({ won: w === myIndex });
    const random = !!session.random;
    const el = screen(
      `<div class="result ${cls}">
         <div class="result-title" ${w != null && w !== myIndex ? `style="color:${players[w].color}"` : ''}>${headline}</div>
         ${w != null ? '<canvas class="result-eraser"></canvas>' : ''}
         ${rewardsHTML(reward)}
         <ol class="ranking">
           ${result.ranking
             .map(
               (pi, r) => `
             <li style="--c:${players[pi].color}">
               <span class="rank">${r + 1}位</span>
               <span class="rname">${esc(players[pi].name)}${pi === myIndex ? '（あなた）' : ''}</span>
               <span class="reraser">${players[pi].eraser.name}</span>
             </li>`,
             )
             .join('')}
         </ol>
         ${resultActionsHTML(result)}
         <div class="row">
           ${
             random
               ? '<button class="btn big primary" data-act="again">🎲 もう一回 さがす</button>'
               : '<button class="btn big primary" data-act="lobby">部屋に 戻る</button>'
           }
           <button class="btn ghost" data-act="leave">出る</button>
         </div>
       </div>`,
    );
    if (w != null) whenFonts(() => drawEraserPreview(el.querySelector('.result-eraser'), players[w].eraser));
    bindResultActions(el, result, players, { headline: plain(headline) }); // 📤 結果をシェア・🎬 ふりかえる
    el.querySelector('[data-act=again]')?.addEventListener('click', async () => {
      await session.leave();
      showRandomSearch();
    });
    el.querySelector('[data-act=lobby]')?.addEventListener('click', async () => {
      // 👑 の人がもどったら、へやを まちあい室にもどす
      const room = await session.db.get(`rooms/${session.code}`);
      const members = sortedMembers(room);
      if (members[0]?.uid === session.uid && room?.meta?.status === 'playing') await session.backToLobby();
      session.keepPresence();
      showLobby(session);
    });
    el.querySelector('[data-act=leave]').onclick = async () => {
      await session.leave();
      ui.showTitle();
    };
  }

  // 通信のじゅんびだけ先にしておく（Firebase のときはログインに少し時間がかかる）
  return {
    showMenu: () => {
      getDb().catch(() => {});
      showMenu();
    },
    /** 招待リンク（?room=1234）から 来たとき */
    joinInvite: (code) => {
      getDb().catch(() => {});
      st.inviteCode = code;
      showMenu();
    },
  };
}
