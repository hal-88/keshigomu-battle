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
import { matchOf, isOut, champion, roundName } from './tournament/bracket.js';
import { TourManager } from './online/tourManager.js';

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
            if (s.querySelector('b')?.textContent === myName(e, session.uid)) s.classList.add('gone');
          });
        }
        void i;
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
        $('status').textContent = 'ざんねん… 表を見て 応援しよう！（観戦は もうすぐ できるようになるよ）';
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
        reward = collection.winTournament({ size: t.size });
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
        <p class="result-sub">${def.name}で 優勝！</p>
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

  // CPU と：自分の端末で ふつうの CPU 戦。結果だけ 表に書く
  function startCpuMatch(info) {
    const t = mgr.tour;
    const meEntry = t.entries[info.me];
    const oppEntry = t.entries[info.oppIdx];
    const players = [
      { name: 'あなた', type: 'human', eraser: findEraser(meEntry.eraserId), color: GAME.playerColors[0], card: drawRandomCard() },
      { name: oppEntry.name, type: 'cpu', level: 'normal', eraser: findEraser(oppEntry.eraserId), color: GAME.playerColors[1], card: drawRandomCard() },
    ];
    showDeal(t, info, players[0].card, () => {
      const el = screen('', 'battle-screen');
      ui.setBattle(
        createBattle(el, {
          desk: findDesk(info.deskId),
          players,
          label: `🏆${roundName(t.size, info.r)}`,
          hideCpuCards: true,
          firstTurn: Math.floor(Math.random() * 2),
          onEnd: (result) => {
            const w = result.winner;
            if (w == null) return showMatchResult(info, null, players, () => startCpuMatch(info)); // 引き分けは もう一度
            const winnerIdx = w === 0 ? info.me : info.oppIdx;
            mgr.report(info.r, info.m, winnerIdx);
            showMatchResult(info, w === 0, players);
          },
          onQuit: leaveRoom,
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
