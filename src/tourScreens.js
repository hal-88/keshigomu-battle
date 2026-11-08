// オンライン・トーナメントの画面：トーナメント表 → 自分の試合（人どうし／CPUと）→ 結果 → 表 → 表彰式
// 試合は 同時に すすむ。自分の試合が 決まったら、カウントダウンして そのまま 試合へ。

import { findDesk } from './config/desks.js';
import { findEraser } from './config/erasers.js';
import { drawRandomCard, findCard } from './config/cards.js';
import { GAME } from './config/game.js';
import { Game } from './logic/Game.js';
import { createBattle } from './battle.js';
import { drawEraserPreview } from './render/drawEraser.js';
import { flipCardHTML } from './ui/cardView.js';
import { collection } from './progress/collection.js';
import { sfx } from './audio/sfx.js';
import { rewardsHTML } from './ui/rewardView.js';
import { bracketHTML } from './ui/bracketView.js';
import { matchOf, isOut, champion, roundName, readyMatches } from './tournament/bracket.js';
import { TourManager } from './online/tourManager.js';
import { plateHTML } from './ui/engraveView.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param ui      main.js の部品 { screen, whenFonts, showTitle, setBattle }
 * @param helpers onlineScreens.js の部品 { showLobby(session), showMenu(msg) }
 */
export function setupTourScreens(ui, helpers) {
  const { screen, whenFonts } = ui;
  let mgr = null; // TourManager（トーナメントの あいだ ずっと 動く）
  let hubOff = null; // 表の画面が 見ている 知らせ
  let inMatch = false; // 自分の試合中（表の画面は 出さない）
  let countdown = 0;

  const myName = (e, me) => (e.uid === me ? 'あなた' : e.name);

  /** トーナメントを はじめる（待合室から） */
  function enter(session) {
    if (mgr && mgr.session !== session) mgr.stop();
    if (!mgr) mgr = new TourManager(session).start();
    showHub();
  }

  function leaveAll() {
    clearTimeout(countdown);
    hubOff?.();
    mgr?.stop();
    mgr = null;
  }

  // ---------- トーナメント表 ----------
  function showHub() {
    inMatch = false;
    clearTimeout(countdown);
    hubOff?.();
    const session = mgr.session;
    const el = screen(
      `<h2 class="head">🏆 オンライン トーナメント</h2>
       <p class="note" data-el="status"></p>
       <div class="bracket-wrap" data-el="bracket"></div>
       <div class="row bracket-buttons" data-el="buttons"></div>
       <div class="watch-list" data-el="watch"></div>
       <div data-el="ceremony"></div>`,
      'bracket-screen',
    );
    const $ = (n) => el.querySelector(`[data-el=${n}]`);
    let lastKey = '';

    const render = () => {
      const t = mgr.tour;
      const meta = mgr.meta;
      if (meta && meta.status === 'lobby') {
        // まとめ役が 待合室に もどした
        hubOff?.();
        helpers.showLobby(session);
        return;
      }
      if (!t) return;
      const me = mgr.myIndex();
      const mine = me >= 0 ? matchOf(t, me) : null;
      const out = me >= 0 && isOut(t, me);
      const champ = champion(t);
      // 表は 中身が かわったときだけ かきなおす（カウントダウンが リセットされないように）
      const key = JSON.stringify([t.rounds, mine && `${mine.r}-${mine.m}`, Object.keys(mgr.members).map((u) => mgr.isHere(u))]);
      if (key === lastKey) return;
      lastKey = key;

      // 表の名前は「あなた」に
      const shown = { ...t, entries: t.entries.map((e) => ({ ...e, name: myName(e, session.uid) })) };
      $('bracket').innerHTML = bracketHTML(shown, { me, now: mine ? `${mine.r}-${mine.m}` : null });
      whenFonts(() => $('bracket').querySelectorAll('.br-eraser').forEach((c) => drawEraserPreview(c, findEraser(c.dataset.id))));
      // いなくなった人は うすく
      t.entries.forEach((e, i) => {
        if (e.uid && !mgr.isHere(e.uid)) {
          $('bracket').querySelectorAll('.br-slot').forEach((s) => {
            if (s.querySelector('b')?.textContent.startsWith(myName(e, session.uid))) s.classList.add('gone');
          });
        }
        void i;
      });

      // 観戦できる試合（人がいて、まだ終わっていない。自分の試合は のぞく）
      const watchable = mine
        ? []
        : readyMatches(t).filter(({ match }) => [match.a, match.b].some((i) => t.entries[i].type !== 'cpu') && match.a !== me && match.b !== me);
      $('watch').innerHTML = watchable.length
        ? `<div class="watch-title">👀 観戦できる試合</div>${watchable
            .map(
              ({ r, m, match }) =>
                `<button class="btn small watch-btn" data-r="${r}" data-m="${m}">${roundName(t.size, r)}：${esc(myName(t.entries[match.a], session.uid))} vs ${esc(myName(t.entries[match.b], session.uid))}</button>`,
            )
            .join('')}`
        : '';
      $('watch').querySelectorAll('.watch-btn').forEach((b) => {
        b.onclick = () => {
          const r = +b.dataset.r;
          const m = +b.dataset.m;
          spectate({ r, m, match: mgr.tour.rounds[r][m] });
        };
      });

      const buttons = $('buttons');
      buttons.innerHTML = '';
      const btn = (label, cls, fn) => {
        const b = document.createElement('button');
        b.className = `btn ${cls}`;
        b.innerHTML = label;
        b.onclick = fn;
        buttons.appendChild(b);
        return b;
      };
      clearTimeout(countdown);

      if (champ != null) {
        $('watch').innerHTML = '';
        $('status').textContent = '🏆 優勝が 決まった！';
        showCeremony($('ceremony'), t, champ, me);
        if (mgr.isLeader()) btn('待合室に 戻る', 'big primary', () => session.backToLobby());
        btn('部屋を 出る', 'ghost', leaveRoom);
        if (!mgr.isLeader()) $('status').textContent += '（👑 の人が 待合室に もどすのを 待ってね）';
        return;
      }
      $('ceremony').innerHTML = '';
      if (mine) {
        const opp = t.entries[mine.match.a === me ? mine.match.b : mine.match.a];
        $('status').innerHTML = `つぎは <b>${roundName(t.size, mine.r)}</b>！ 相手は <b>${esc(opp.name)}</b>（${findEraser(opp.eraserId).name}）`;
        let n = 5;
        const go = btn(`試合へ！（${n}）`, 'big primary', () => startMatch(mine));
        const tickDown = () => {
          n--;
          if (n <= 0) return startMatch(mine);
          go.textContent = `試合へ！（${n}）`;
          countdown = setTimeout(tickDown, 1000);
        };
        countdown = setTimeout(tickDown, 1000);
        sfx.card();
      } else if (out) {
        $('status').textContent = 'ざんねん… でも 下の「👀 観戦」で ほかの試合を 応援しよう！';
        btn('部屋を 出る', 'ghost', leaveRoom);
      } else if (me < 0) {
        $('status').textContent = 'トーナメントを 見ているよ';
        btn('部屋を 出る', 'ghost', leaveRoom);
      } else {
        $('status').textContent = 'ほかの試合を 待っているよ… 勝ちのこった人と 次に 戦うよ';
        btn('部屋を 出る', 'ghost', leaveRoom);
      }
    };
    hubOff = mgr.onChange(render);
    render();
  }

  async function leaveRoom() {
    const session = mgr?.session;
    leaveAll();
    if (session) await session.leave();
    ui.showTitle();
  }

  // ---------- 観戦 ----------
  async function spectate({ r, m, match }) {
    clearTimeout(countdown);
    hubOff?.();
    hubOff = null;
    const t = mgr.tour;
    const key = `${r}-${m}`;
    const session = mgr.session.forMatch(key);
    const g = await session.db.get(`rooms/${session.code}/${session.prefix}game`);
    if (!g || !g.state || g.state.phase === 'over') {
      showHub();
      return;
    }
    const ea = t.entries[match.a];
    const eb = t.entries[match.b];
    const players = [ea, eb].map((e, i) => ({
      name: e.name,
      type: 'remote',
      eraser: findEraser(e.eraserId),
      color: GAME.playerColors[i],
      card: findCard(g.state.players?.[i]?.cardId) || null,
    }));
    let done = false;
    let off = null;
    const back = () => {
      if (done) return;
      done = true;
      off?.();
      session.stopAll();
      showHub();
    };
    // 自分の試合が 決まったら、表に もどる（試合へ）
    off = mgr.onChange(() => {
      const me = mgr.myIndex();
      if (me >= 0 && matchOf(mgr.tour, me)) back();
      else if (mgr.tour?.rounds[r]?.[m]?.winner != null) setTimeout(back, 2500);
    });
    const el = screen('', 'battle-screen');
    ui.setBattle(
      createBattle(el, {
        desk: findDesk(match.deskId),
        players,
        label: `👀${roundName(t.size, r)}`,
        online: { session, myIndex: -1, order: g.order, seq: g.seq, state: g.state, spectator: true },
        onEnd: () => setTimeout(back, 3000),
        onQuit: back,
      }),
    );
  }

  // ---------- 表彰式 ----------
  function showCeremony(box, t, champ, me) {
    const winner = t.entries[champ];
    const isMe = champ === me;
    const def = findEraser(winner.eraserId);
    let reward = null;
    if (isMe) {
      // ごほうびは 1回だけ（同じトーナメントで 2回もらわないように）
      const flag = `keshigomu-tour-reward-${mgr.session.code}-${t.tid}`;
      let done = false;
      try {
        done = !!localStorage.getItem(flag);
        if (!done) localStorage.setItem(flag, '1');
      } catch {
        /* 保存できなくても よい */
      }
      if (!done) {
        reward = collection.winTournament({ size: t.size, cup: t.cup || 'オンライン杯', name: winner.name, usedEraserId: winner.eraserId }); // 名前は トーナメント表の なまえ
        mgr.session.updateMe({ wins: collection.tournamentWins() }); // 名前の横の 🏆 を ふやす
        sfx.win();
        if (reward.eraser) setTimeout(() => sfx.rare(), 900);
      }
    }
    if (box.dataset.tid === t.tid) return; // もう出している
    box.dataset.tid = t.tid;
    box.innerHTML = `
      <div class="result champion-result ${isMe ? 'win' : ''}">
        <div class="champ-trophy">🏆</div>
        <div class="result-title">${isMe ? '優勝！' : `優勝は ${esc(winner.name)}`}</div>
        <canvas class="result-eraser"></canvas>
        <p class="result-sub">${esc(t.cup || '')} ${def.name}で 優勝！</p>
        ${isMe ? (() => { const tr = collection.engravings(winner.eraserId).find((x) => x.kind === 'win'); return tr ? `<div class="engrave-note">${def.name}に 刻まれた！</div>${plateHTML(tr)}` : ''; })() : ''}
        ${
          reward?.eraser
            ? `<div class="reward champ-reward">
                 <div class="reward-title">🎁 優勝の ごほうび！ 限定消しゴム</div>
                 <canvas class="reward-eraser big" data-id="${reward.eraser.id}"></canvas>
                 <div><span class="rarity-tag r-champion">チャンピオン</span> <b>${reward.eraser.name}</b> が 手に入った！</div>
               </div>`
            : ''
        }
      </div>`;
    whenFonts(() => {
      drawEraserPreview(box.querySelector('.result-eraser'), def);
      box.querySelectorAll('.reward-eraser').forEach((cv) => drawEraserPreview(cv, findEraser(cv.dataset.id)));
    });
    box.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  // ---------- 自分の試合 ----------
  function startMatch({ r, m, match }) {
    clearTimeout(countdown);
    hubOff?.();
    hubOff = null;
    inMatch = true;
    const t = mgr.tour;
    const me = mgr.myIndex();
    const oppIdx = match.a === me ? match.b : match.a;
    const opp = t.entries[oppIdx];
    const key = `${r}-${m}`;
    const info = { r, m, key, match, me, oppIdx, deskId: match.deskId };
    if (opp.type === 'cpu') startCpuMatch(info);
    else startHumanMatch(info);
  }

  const headHTML = (t, info, meEntry, oppEntry) => `
    <div class="streak-head">
      <span class="streak-round">🏆 ${roundName(t.size, info.r)}（机：${findDesk(info.deskId).name}）</span>
      <div class="vs">
        <div class="vs-side me">
          <canvas class="vs-eraser" data-id="${meEntry.eraserId}"></canvas>
          <div class="vs-name">あなた<br><b>${findEraser(meEntry.eraserId).name}</b></div>
        </div>
        <div class="vs-mark">VS</div>
        <div class="vs-side cpu">
          <canvas class="vs-eraser" data-id="${oppEntry.eraserId}"></canvas>
          <div class="vs-name">${esc(oppEntry.name)}<br><b>${findEraser(oppEntry.eraserId).name}</b></div>
        </div>
      </div>
    </div>`;

  /** カードを1枚 見せて「戦う！」（相手のカードは 内緒） */
  function showDeal(t, info, myCard, onGo) {
    const meEntry = t.entries[info.me];
    const oppEntry = t.entries[info.oppIdx];
    const isNew = myCard && !collection.hasSeenCard(myCard.id);
    if (myCard) collection.markCardsSeen([myCard.id]);
    collection.markSeen([meEntry.eraserId, oppEntry.eraserId]);
    const el = screen(
      `${headHTML(t, info, meEntry, oppEntry)}
       <h2 class="head">能力カード</h2>
       <p class="deal-note">相手のカードは 内緒。使うまで 分からないよ</p>
       <div class="deal n2">
         <div class="deal-slot">
           <div class="deal-name" style="background:${GAME.playerColors[0]}">あなた</div>
           ${myCard ? flipCardHTML(myCard, '', { isNew }) : ''}
         </div>
       </div>
       <button class="btn big primary hidden" data-act="go">戦う！</button>`,
      'deal-screen',
    );
    whenFonts(() => el.querySelectorAll('.vs-eraser').forEach((c, k) => drawEraserPreview(c, findEraser(c.dataset.id), k ? 0.18 : -0.18)));
    const flip = el.querySelector('.flip');
    const go = el.querySelector('[data-act=go]');
    const open = () => {
      if (!flip || flip.classList.contains('open')) return;
      flip.classList.add('open');
      sfx.flip();
      if (myCard.rarity !== 'normal') setTimeout(() => sfx.rare(), 350);
      go.classList.remove('hidden');
    };
    flip?.addEventListener('click', open);
    const tm = setTimeout(open, 900);
    // 時間が きたら そのまま 戦う（同時に すすめるため）
    const auto = setTimeout(() => go.click(), 6000);
    if (!flip) go.classList.remove('hidden');
    go.onclick = () => {
      clearTimeout(tm);
      clearTimeout(auto);
      onGo();
    };
  }

  // CPU と：自分の端末で CPU の番も 計算する。動きは 試合の場所に 送るので、ほかの人が 観戦できる
  async function startCpuMatch(info) {
    const t = mgr.tour;
    const ea = t.entries[info.match.a];
    const eb = t.entries[info.match.b];
    const order = [ea.uid || 'cpu', eb.uid || 'cpu'];
    const myIndex = info.match.a === info.me ? 0 : 1;
    const players = [ea, eb].map((e, i) => ({
      name: i === myIndex ? 'あなた' : e.name,
      type: i === myIndex ? 'human' : 'cpu',
      level: 'normal',
      eraser: findEraser(e.eraserId),
      color: GAME.playerColors[i],
      card: drawRandomCard(),
    }));
    const session = mgr.session.forMatch(info.key);
    const game = new Game({ desk: findDesk(info.deskId), players, firstTurn: Math.floor(Math.random() * 2) });
    const state = game.exportState();
    await mgr.session.clearMatch(info.key);
    await session.start(order, state);
    showDeal(t, info, players[myIndex].card, () => {
      const el = screen('', 'battle-screen');
      ui.setBattle(
        createBattle(el, {
          desk: findDesk(info.deskId),
          players,
          label: `🏆${roundName(t.size, info.r)}`,
          hideCpuCards: true,
          online: { session, myIndex, order, seq: 1, state, cpuOwner: true },
          onEnd: (result) => {
            session.stopAll();
            const w = result.winner;
            if (w == null) return showMatchResult(info, null, players, () => startCpuMatch(info)); // 引き分けは もう一度
            mgr.report(info.r, info.m, w === 0 ? info.match.a : info.match.b);
            showMatchResult(info, w === myIndex, players);
          },
          onQuit: () => {
            session.stopAll();
            leaveRoom();
          },
        }),
      );
    });
  }

  // 人どうし：いまの オンライン対戦と同じ（弾いた人の端末で計算して、試合の場所に 送る）
  function startHumanMatch(info) {
    const t = mgr.tour;
    const session = mgr.session.forMatch(info.key);
    const meEntry = t.entries[info.me];
    const oppEntry = t.entries[info.oppIdx];
    const order = [t.entries[info.match.a].uid, t.entries[info.match.b].uid];
    const myIndex = order.indexOf(mgr.session.uid);
    let entered = false;

    const el = screen(
      `${headHTML(t, info, meEntry, oppEntry)}
       <div class="loading"><div class="spinner"></div><p>${esc(oppEntry.name)}を 待っているよ…</p></div>
       <button class="btn ghost" data-act="leave">部屋を 出る</button>`,
      'deal-screen',
    );
    whenFonts(() => el.querySelectorAll('.vs-eraser').forEach((c, k) => drawEraserPreview(c, findEraser(c.dataset.id), k ? 0.18 : -0.18)));
    el.querySelector('[data-act=leave]').onclick = () => {
      session.stopAll();
      leaveRoom();
    };

    // 試合の さいしょの状態が とどいたら、カードの画面へ
    session.watchGame((g) => {
      // 引き分けで やりなおすときは、前の試合（同じ gid・もう終わった状態）は 見ない
      if (entered || !g || !g.state || !g.gid || g.gid === info.lastGid || g.state.phase === 'over') return;
      entered = true;
      info.lastGid = g.gid;
      const playersOf = () =>
        order.map((uid, i) => {
          const e = t.entries[i === 0 ? info.match.a : info.match.b];
          return {
            name: uid === mgr.session.uid ? 'あなた' : e.name,
            type: uid === mgr.session.uid ? 'human' : 'remote',
            eraser: findEraser(e.eraserId),
            color: GAME.playerColors[i],
            card: findCard(g.state.players?.[i]?.cardId) || null,
          };
        });
      const players = playersOf();
      showDeal(t, info, players[myIndex].card, async () => {
        // おしたときの いちばん新しい状態から（もう相手が 弾いているかも）
        const latest = (await session.db.get(`rooms/${session.code}/${session.prefix}game`)) || g;
        session.stopAll();
        const bel = screen('', 'battle-screen');
        ui.setBattle(
          createBattle(bel, {
            desk: findDesk(info.deskId),
            players,
            label: `🏆${roundName(t.size, info.r)}`,
            online: { session, myIndex, order, seq: latest.seq, state: latest.state },
            onEnd: (result) => {
              const w = result.winner;
              if (w == null) {
                // 引き分け：作る人が 試合を作りなおす → みんな もう一度
                if (mgr.creatorUid(info.match) === mgr.session.uid) {
                  mgr.session.clearMatch(info.key).then(() => createMatchState(info, order));
                }
                return showMatchResult(info, null, players, () => startHumanMatch(info));
              }
              mgr.report(info.r, info.m, w === 0 ? info.match.a : info.match.b);
              showMatchResult(info, w === myIndex, players);
            },
            onQuit: () => {
              session.stopAll();
              leaveRoom();
            },
          }),
        );
      });
    });
    // さいしょの状態を作る（つながっている方。まだ なければ）
    if (mgr.creatorUid(info.match) === mgr.session.uid) {
      session.db.get(`rooms/${session.code}/${session.prefix}game`).then((g) => {
        if (!g) createMatchState(info, order);
      });
    }
  }

  function createMatchState(info, order) {
    const t = mgr.tour;
    const players = order.map((uid, i) => {
      const e = t.entries[i === 0 ? info.match.a : info.match.b];
      return { name: e.name, type: 'remote', eraser: findEraser(e.eraserId), color: GAME.playerColors[i], card: drawRandomCard() };
    });
    const game = new Game({ desk: findDesk(info.deskId), players, firstTurn: Math.floor(Math.random() * 2) });
    return mgr.session.forMatch(info.key).start(order, game.exportState());
  }

  // ---------- 試合の結果 ----------
  function showMatchResult(info, won, players, retry = null) {
    const t = mgr.tour;
    const final = info.r === t.rounds.length - 1;
    const draw = won == null;
    const reward = draw ? null : collection.finishMatch({ won }); // チケットは ふつうどおり（消しゴムは もらえない）
    const el = screen(
      `<div class="result ${draw ? 'draw' : won ? 'win' : 'lose'}">
         <div class="result-title">${draw ? '引き分け！' : won ? '勝ち！' : '負け…'}</div>
         <div class="streak-box"><div class="streak-count">${
           draw
             ? 'もう一度 たたかうよ'
             : won
               ? final
                 ? '🏆 優勝！'
                 : `${roundName(t.size, info.r)} 突破！`
               : `${roundName(t.size, info.r)}で 敗退…`
         }</div></div>
         ${rewardsHTML(reward)}
         <div class="row"><button class="btn big primary" data-act="next">${draw ? 'もう一度' : 'トーナメント表へ →'}</button></div>
       </div>`,
    );
    if (won) sfx.win();
    else if (won === false) sfx.lose();
    void players;
    const next = () => (draw && retry ? retry() : showHub());
    el.querySelector('[data-act=next]').onclick = next;
    // 同時に すすめるため、すこし待ったら 自動で つぎへ
    setTimeout(() => {
      if (el.isConnected) next();
    }, draw ? 3000 : 8000);
  }

  return { enter, leaveAll, isActive: () => !!mgr, inMatch: () => inMatch };
}
