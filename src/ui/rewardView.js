// 結果画面の「ごほうび」（新しい消しゴム・ガチャチケット）の表示。CPU戦とオンラインで使う。

import { ERASER_RARITY } from '../config/erasers.js';
import { GAME } from '../config/game.js';
import { collection } from '../progress/collection.js';

const rarityTag = (def) => {
  const r = def.rarity || 'normal';
  return r === 'normal' ? '' : `<div class="rarity-tag r-${r}">${ERASER_RARITY[r].label}</div>`;
};

/** collection.finishMatch() のもどり値を HTML にする（canvas.reward-eraser には あとで絵を描く） */
export function rewardsHTML(reward) {
  if (!reward) return '';
  const unlocked = reward.unlocked
    .map(
      (e) => `
      <div class="reward new-eraser r-${e.rarity || 'normal'}">
        <canvas class="reward-eraser" data-id="${e.id}"></canvas>
        <div><b class="new">NEW!</b> ${rarityTag(e)} <b>${e.name}</b> が 使えるようになった！</div>
      </div>`,
    )
    .join('');
  const tickets = collection.tickets();
  const ticket = reward.ticket
    ? `<div class="reward ticket"><span class="big-ticket">🎫</span><div><b>ガチャチケット ゲット！</b><br>持っているチケット：${tickets}枚</div></div>`
    : '';
  const bonus = reward.bonus
    ? `<div class="reward ticket bonus"><span class="big-ticket">🔥</span><div><b>${GAME.collection.streakBonusEvery}連勝 ボーナス！</b><br>チケットを もう1枚（持っているチケット：${tickets}枚）</div></div>`
    : '';
  const hint =
    !reward.ticket && collection.canGetTicket()
      ? `<div class="reward hint-ticket">🎫 あと <b>${collection.matchesToPity()}</b> 戦で チケット確定！</div>`
      : '';
  return `<div class="rewards">${unlocked}${ticket}${bonus}${hint}</div>`;
}
