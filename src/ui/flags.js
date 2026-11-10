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
  gb: () =>
    svg(
      '<rect width="30" height="20" fill="#012169"/><path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0 L30 20 M30 0 L0 20" stroke="#c8102e" stroke-width="1.5"/>' +
        '<path d="M15 0 V20 M0 10 H30" stroke="#fff" stroke-width="6"/><path d="M15 0 V20 M0 10 H30" stroke="#c8102e" stroke-width="3.5"/>',
    ), // イギリス
  ca: () => svg('<rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#d52b1e"/><rect x="22.5" width="7.5" height="20" fill="#d52b1e"/><path d="M15 4 L16.2 7 L18.5 6.2 L17.6 9.8 L19.6 9.6 L18.8 11.4 L16 11.6 L15.6 15 L14.4 15 L14 11.6 L11.2 11.4 L10.4 9.6 L12.4 9.8 L11.5 6.2 L13.8 7 Z" fill="#d52b1e"/>'), // カナダ
  it: () => svg(stripesV('#009246', '#ffffff', '#ce2b37')), // イタリア
  fi: () => svg('<rect width="30" height="20" fill="#fff"/><path d="M11 0 V20 M0 10 H30" stroke="#002f6c" stroke-width="5"/>'), // フィンランド
  mn: () => svg(`${stripesV('#c4272f', '#015197', '#c4272f')}<circle cx="5" cy="6" r="1.4" fill="#f9cf02"/><rect x="3.4" y="8.4" width="3.2" height="7" fill="#f9cf02"/>`), // モンゴル
  br: () => svg('<rect width="30" height="20" fill="#009c3b"/><polygon points="15,2.5 27.5,10 15,17.5 2.5,10" fill="#ffdf00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/><path d="M11 9.2 Q15 8 19 10.6" stroke="#fff" stroke-width="0.8" fill="none"/>'), // ブラジル
  us: () => {
    let s = '';
    for (let i = 0; i < 7; i++) s += `<rect y="${(i * 20) / 6.5}" width="30" height="${20 / 13}" fill="#b22234"/>`;
    s = `<rect width="30" height="20" fill="#fff"/>${s}<rect width="13" height="10.8" fill="#3c3b6e"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) s += `<circle cx="${1.6 + c * 2.4 + (r % 2) * 1.2}" cy="${1.6 + r * 2.5}" r="0.55" fill="#fff"/>`;
    return svg(s);
  }, // アメリカ
  ph: () => svg(`<rect width="30" height="10" fill="#0038a8"/><rect y="10" width="30" height="10" fill="#ce1126"/><polygon points="0,0 13,10 0,20" fill="#fff"/><circle cx="4.5" cy="10" r="2" fill="#fcd116"/>${star(1.5, 3, 0.9, '#fcd116')}${star(1.5, 17, 0.9, '#fcd116')}${star(10.5, 10, 0.9, '#fcd116')}`), // フィリピン
  th: () => svg('<rect width="30" height="20" fill="#a51931"/><rect y="3.33" width="30" height="13.33" fill="#f4f5f8"/><rect y="6.67" width="30" height="6.67" fill="#2d2a4a"/>'), // タイ（タイ・マレーシアなど）
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
