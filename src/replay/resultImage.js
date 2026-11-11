// 対戦結果の シェア画像（1080×1080。SNS で 見やすい 正方形）。
// 勝った 消しゴムを 大きく、みんなの 順位と 消しゴム、机・ターン数・日付、ロゴを のせる。

import { drawEraser } from '../render/drawEraser.js';
import { eraserExtent } from '../logic/geometry.js';

const FONT = '"M PLUS Rounded 1c", sans-serif';
const S = 1080;

/**
 * @param {object} d
 *   headline … 「赤の 勝ち！」など（文字だけ）
 *   sub      … 下の 一言
 *   players  … [{ name, color, eraser }]
 *   ranking  … 順位の じゅんの プレイヤー番号（なければ そのまま）
 *   winner   … 勝った プレイヤー番号（引き分けは null）
 *   deskName・turns
 * @returns {Promise<Blob>}
 */
export async function makeResultImage(d) {
  await document.fonts?.ready;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');

  // 方眼の ノート
  ctx.fillStyle = '#fbf6ec';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#efe4d0';
  ctx.lineWidth = 2;
  for (let x = 0; x <= S; x += 45) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, S);
    ctx.stroke();
  }
  for (let y = 0; y <= S; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y);
    ctx.stroke();
  }

  const text = (str, x, y, size, color, { align = 'center', weight = 800, stroke = 0 } = {}) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.lineWidth = stroke;
      ctx.strokeStyle = '#fff';
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  };
  const eraser = (def, x, y, size, angle = -0.15) => {
    const k = size / (eraserExtent(def) * 2 || 40);
    drawEraser(ctx, def, x, y, angle, { scale: k, shadow: true });
  };

  // ロゴ
  ctx.font = `800 66px ${FONT}`;
  const w1 = ctx.measureText('消しゴム').width;
  const w2 = ctx.measureText('バトル').width;
  const lx = S / 2 - (w1 + w2) / 2;
  text('消しゴム', lx, 78, 66, '#3b2f22', { align: 'left', stroke: 10 });
  text('バトル', lx + w1, 78, 66, '#ff6b4a', { align: 'left', stroke: 10 });

  // 結果
  const winColor = d.winner != null ? d.players[d.winner]?.color || '#3b2f22' : '#3b2f22';
  text(d.headline || '', S / 2, 190, 92, winColor, { stroke: 14 });
  if (d.winner != null) {
    // 光の 輪
    const g = ctx.createRadialGradient(S / 2, 400, 30, S / 2, 400, 230);
    g.addColorStop(0, 'rgba(255,230,120,0.85)');
    g.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(S / 2, 400, 230, 0, Math.PI * 2);
    ctx.fill();
    eraser(d.players[d.winner].eraser, S / 2, 405, 300);
    text('👑', S / 2, 255, 64, '#000', { weight: 400 });
  }
  if (d.sub) text(d.sub, S / 2, 600, 40, '#6d5d49', { stroke: 8 });

  // みんなの 順位
  const order = d.ranking?.length ? d.ranking : d.players.map((_, i) => i);
  const n = order.length;
  const cw = Math.min(240, (S - 80) / n - 16);
  const total = n * cw + (n - 1) * 16;
  order.forEach((pi, r) => {
    const p = d.players[pi];
    if (!p) return;
    const x = S / 2 - total / 2 + r * (cw + 16);
    const y = 660;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect?.(x, y, cw, 250, 26);
    ctx.fill();
    ctx.stroke();
    text(`${r + 1}位`, x + cw / 2, y + 34, 34, r === 0 && d.winner != null ? '#e0a800' : '#8a7a66');
    eraser(p.eraser, x + cw / 2, y + 112, Math.min(110, cw * 0.55));
    text(p.name, x + cw / 2, y + 182, 34, p.color, { stroke: 0 });
    ctx.font = `700 24px ${FONT}`;
    text(p.eraser.name, x + cw / 2, y + 222, 24, '#6d5d49', { weight: 700 });
  });

  // 机・ターン・日付・URL
  const dt = new Date();
  const date = `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
  text(`${d.deskName ? `机：${d.deskName}　` : ''}${d.turns ? `${d.turns}ターン　` : ''}${date}`, S / 2, 960, 32, '#6d5d49');
  text('hal-88.github.io/keshigomu-battle', S / 2, 1022, 30, '#ff6b4a');

  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

/** シェア（スマホ・タブレット）。できなければ 保存 */
export async function shareOrSaveFile(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: `${title} #消しゴムバトル` });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancel';
    }
  }
  saveFile(blob, name);
  return 'saved';
}

export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
