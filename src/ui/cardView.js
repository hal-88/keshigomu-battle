// 能力カードの見た目（HTML）。タイプ別の色・レアは光る枠。

import { CARD_TYPES, RARITY } from '../config/cards.js';

export function cardHTML(def, extraClass = '') {
  const type = CARD_TYPES[def.type];
  const rarityClass = { rare: 'rare', superrare: 'rare superrare', ultra: 'rare ultra', legend: 'rare legend' }[def.rarity] || '';
  return `
    <div class="card ${rarityClass} ${extraClass}" style="--type:${type.color}">
      <div class="card-top">
        <span class="card-type">${type.label}</span>
        <span class="card-rarity">${RARITY[def.rarity].label}</span>
      </div>
      <div class="card-art"><span>${def.icon}</span></div>
      <div class="card-name">${def.name}</div>
      <div class="card-desc">${def.desc}</div>
    </div>`;
}

/**
 * 裏向きからめくれるカード。.open をつけるとめくれる
 * isNew … はじめて見るカードなら、めくったときに「NEW!」が出る
 */
export function flipCardHTML(def, extraClass = '', { isNew = false } = {}) {
  return `
    <div class="flip ${extraClass}">
      <div class="flip-inner">
        <div class="flip-face flip-back"><div class="card-back"><span>?</span></div></div>
        <div class="flip-face flip-front">${cardHTML(def)}${isNew ? '<div class="new-ribbon">NEW!</div>' : ''}</div>
      </div>
    </div>`;
}
