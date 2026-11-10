// 国旗（世界の遊びシリーズ）。絵文字の 国旗は Windows などで 文字に なってしまうので、SVG で かく。
// どれも 3:2 の かんたんな 形（子どもが「どこの国？」と 調べる きっかけ用）。

const W = 30;
const H = 20;
const svg = (body) => `<svg class="flag" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${body}<rect width="${W}" height="${H}" fill="none" stroke="rgba(0,0,0,0.25)"/></svg>`;
const stripesV = (a, b, c) => `<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`;
const stripesH = (a, b, c) => `<rect width="30" height="6.67" fill="${a}"/><rect y="6.67" width="30" height="6.67" fill="${b}"/><rect y="13.33" width="30" height="6.67" fill="${c}"/>`;
const star = (cx, cy, r, color) => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    p.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `<polygon points="${p.join(' ')}" fill="${color}"/>`;
};

const FLAGS = {
  fr: () => svg(stripesV('#0055a4', '#ffffff', '#ef4135')), // フランス
  cn: () => svg(`<rect width="30" height="20" fill="#de2910"/>${star(5, 5, 3, '#ffde00')}${star(10, 2, 1, '#ffde00')}${star(12, 4.5, 1, '#ffde00')}${star(12, 7.5, 1, '#ffde00')}${star(10, 10, 1, '#ffde00')}`), // 中国
  // アフリカの国々（ひとつの 国旗は ないので、地球の アフリカ）
  af: () => svg(`<rect width="30" height="20" fill="#4fc3f7"/><path d="M11 4 L19 3 L22 7 L20 10 L21 14 L17 18 L15 13 L12 10 L9 9 Z" fill="#7cb342"/>`),
  in: () => svg(`${stripesH('#ff9933', '#ffffff', '#138808')}<circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width="0.8"/>`), // インド
  eu: () => {
    let s = '<rect width="30" height="20" fill="#003399"/>';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      s += `<circle cx="${(15 + Math.cos(a) * 6).toFixed(2)}" cy="${(10 + Math.sin(a) * 6).toFixed(2)}" r="0.9" fill="#ffcc00"/>`;
    }
    return svg(s);
  }, // ヨーロッパ
  sc: () => svg('<rect width="30" height="20" fill="#0065bd"/><path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" stroke-width="3.5"/>'), // スコットランド
  kr: () =>
    svg(
      '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5" fill="#003478"/><path d="M10 10 A5 5 0 0 1 20 10 A2.5 2.5 0 0 1 15 10 A2.5 2.5 0 0 0 10 10" fill="#c60c30"/>' +
        '<g stroke="#000" stroke-width="0.9"><path d="M4 4 l3 -2 M4.8 5.2 l3 -2 M5.6 6.4 l3 -2"/><path d="M22.5 13.5 l3 2 M21.7 14.7 l3 2 M20.9 15.9 l3 2"/><path d="M22.5 6.4 l3 -2 M21.7 5.2 l3 -2 M20.9 4 l3 -2"/><path d="M4 16 l3 2 M4.8 14.8 l3 2 M5.6 13.6 l3 2"/></g>',
    ), // 韓国
  au: () =>
    svg(
      '<rect width="30" height="20" fill="#012169"/><rect width="13" height="9" fill="#012169"/><path d="M0 0 L13 9 M13 0 L0 9" stroke="#fff" stroke-width="1.8"/><path d="M6.5 0 V9 M0 4.5 H13" stroke="#fff" stroke-width="2.6"/><path d="M6.5 0 V9 M0 4.5 H13" stroke="#c8102e" stroke-width="1.4"/>' +
        `${star(7, 15, 2.2, '#fff')}${star(23, 4, 1.2, '#fff')}${star(26, 9, 1.2, '#fff')}${star(21, 10, 1.2, '#fff')}${star(23, 16, 1.2, '#fff')}`,
    ), // オーストラリア
  mx: () => svg(`${stripesV('#006847', '#ffffff', '#ce1126')}<circle cx="15" cy="10" r="2.4" fill="#8d6e3a"/>`), // メキシコ
  ru: () => svg(stripesH('#ffffff', '#0039a6', '#d52b1e')), // ロシア
};

/** 国旗の SVG（HTML の 文字）。ない国は 地球 */
export function flagSVG(code) {
  return (FLAGS[code] || FLAGS.af)();
}

/** 「○○で 生まれた 遊び」の 行（図鑑・ガチャで 出す） */
export function countryLine(def) {
  const c = def?.country;
  if (!c) return '';
  return `<div class="country-line">${flagSVG(c.flag)}<span>${c.name}で 生まれた 遊び</span></div>`;
}
