// 消しゴムに 刻まれた 優勝の記録（大会名・名前・日付）の見た目

import { collection } from '../progress/collection.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 1つの 刻印（金の プレート） */
export function plateHTML(t) {
  return t.kind === 'reward'
    ? `<div class="engrave reward">🎁 ${esc(t.cup || '')}の ごほうび<small>${esc(t.date)}</small></div>`
    : `<div class="engrave">🏆 ${esc(t.cup || '')} 優勝 ${esc(t.name || '')}<small>${esc(t.date)}</small></div>`;
}

/** 消しゴムの くわしい画面に出す 刻印（新しいもの3つまで） */
export function engraveHTML(eraserId, max = 3) {
  const list = collection.engravings(eraserId);
  if (!list.length) return '';
  const more = list.length > max ? `<small class="engrave-more">ほか ${list.length - max}こ</small>` : '';
  return `<div class="engraves">${list.slice(0, max).map(plateHTML).join('')}${more}</div>`;
}

/** 選ぶ画面の 小さな しるし（その消しゴムで 優勝した回数） */
export function winBadgeHTML(eraserId) {
  const wins = collection.engravings(eraserId).filter((t) => t.kind === 'win').length;
  return wins ? `<div class="win-badge">🏆×${wins}</div>` : '';
}

/** 刻印に 入れる 自分の名前（オンラインの ニックネーム。なければ「あなた」） */
export function myPlayerName() {
  try {
    return (localStorage.getItem('keshigomu-online-name') || '').trim() || 'あなた';
  } catch {
    return 'あなた';
  }
}
