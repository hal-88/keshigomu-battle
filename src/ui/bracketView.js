// トーナメント表の見た目（HTML）。消しゴムの小さな絵は、あとで canvas[data-id] に描く。

import { roundName, champion } from '../tournament/bracket.js';
import { findEraser } from '../config/erasers.js';
import { findDesk } from '../config/desks.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param br    トーナメント表
 * @param me    自分の entry の番号（いなければ -1）
 * @param fresh いま決まったばかりの試合（'r-m'）。光らせる
 * @param now   いま戦う試合（'r-m'）。目立たせる
 */
export function bracketHTML(br, { me = -1, fresh = new Set(), now = null } = {}) {
  const slot = (idx, match) => {
    if (idx == null) return '<div class="br-slot empty">？</div>';
    const e = br.entries[idx];
    const def = findEraser(e.eraserId);
    const decided = match.winner != null;
    const cls = [
      'br-slot',
      idx === me ? 'me' : '',
      e.type === 'cpu' ? 'cpu' : 'human',
      decided && match.winner === idx ? 'win' : '',
      decided && match.winner !== idx ? 'lose' : '',
    ].join(' ');
    return `
      <div class="${cls}">
        <canvas class="br-eraser" data-id="${def.id}"></canvas>
        <div class="br-name"><b>${esc(e.name)}${e.wins ? ` <span class="name-trophy">🏆${e.wins}</span>` : ''}</b><small>${def.name}</small></div>
      </div>`;
  };
  const cols = br.rounds
    .map(
      (list, r) => `
      <div class="br-col">
        <div class="br-round">${roundName(br.size, r)}</div>
        <div class="br-matches">
          ${list
            .map((match, m) => {
              const key = `${r}-${m}`;
              const desk = findDesk(match.deskId);
              return `
            <div class="br-match ${fresh.has(key) ? 'fresh' : ''} ${now === key ? 'now' : ''}">
              ${slot(match.a, match)}
              ${slot(match.b, match)}
              <div class="br-desk">${desk ? desk.name : ''}</div>
            </div>`;
            })
            .join('')}
        </div>
      </div>`,
    )
    .join('');
  const c = champion(br);
  const champ =
    c != null
      ? `<div class="br-col champ"><div class="br-round">優勝</div><div class="br-matches"><div class="br-match champ">${slot(c, { winner: c })}</div></div></div>`
      : `<div class="br-col champ"><div class="br-round">優勝</div><div class="br-matches"><div class="br-match champ"><div class="br-slot empty">🏆</div></div></div></div>`;
  return `<div class="bracket n${br.size}">${cols}${champ}</div>`;
}
