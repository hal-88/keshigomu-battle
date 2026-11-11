// 結果画面の 右上：「📤 結果をシェア」（画像）と「🎬 ふりかえる」（試合を はじめから 見なおす）
import { makeResultImage, shareOrSaveFile, saveFile } from './resultImage.js';
import { openReplayViewer, setLastReplay } from './replayView.js';

/** 結果画面に 入れる HTML */
export function resultActionsHTML(result) {
  return `<div class="result-actions">
      <button class="replay-mini" data-act="shareImg">📤 結果をシェア</button>
      ${result?.replay ? '<button class="replay-mini" data-act="review">🎬 ふりかえる</button>' : ''}
    </div>`;
}

/**
 * ボタンを つなぐ
 * @param info { headline, sub }（文字だけ）
 */
export function bindResultActions(root, result, players, info = {}) {
  if (result?.replay) setLastReplay(result.replay);
  root.querySelector('[data-act=review]')?.addEventListener('click', () => openReplayViewer(result.replay));
  root.querySelector('[data-act=shareImg]')?.addEventListener('click', () => openShareImage(root, result, players, info));
}

async function openShareImage(root, result, players, info) {
  const ov = document.createElement('div');
  ov.className = 'overlay fixed show';
  ov.innerHTML = '<div class="modal share-modal"><div class="replay-head">📤 画像を 作っているよ…</div></div>';
  root.appendChild(ov);
  const modal = ov.querySelector('.modal');
  let url = null;
  const close = () => {
    if (url) URL.revokeObjectURL(url);
    ov.remove();
  };
  ov.addEventListener('click', (e) => {
    if (e.target === ov) close();
  });
  let blob;
  try {
    blob = await makeResultImage({
      headline: info.headline,
      sub: info.sub,
      players,
      ranking: result.ranking,
      winner: result.winner,
      deskName: result.deskName,
      turns: result.turns,
    });
  } catch {
    blob = null;
  }
  if (!ov.isConnected) return;
  if (!blob) {
    modal.innerHTML = '<p>画像を 作れなかったよ</p><button class="btn" data-act="close">閉じる</button>';
    modal.querySelector('[data-act=close]').onclick = close;
    return;
  }
  url = URL.createObjectURL(blob);
  const name = `keshigomu-battle-${Date.now()}.png`;
  const title = info.headline ? `消しゴムバトル：${info.headline}` : '消しゴムバトル';
  const canShare = !!navigator.canShare?.({ files: [new File([blob], name, { type: 'image/png' })] });
  modal.innerHTML = `
    <img class="share-img" src="${url}" alt="結果の 画像">
    <p class="note">SNS に のせるときは おうちの人に きいてね</p>
    <div class="row">
      ${canShare ? '<button class="btn primary" data-act="share">📤 シェア</button>' : ''}
      <button class="btn ${canShare ? '' : 'primary'}" data-act="save">💾 保存</button>
      <button class="btn ghost" data-act="close">閉じる</button>
    </div>`;
  modal.querySelector('[data-act=share]')?.addEventListener('click', () => shareOrSaveFile(blob, name, title));
  modal.querySelector('[data-act=save]').onclick = () => saveFile(blob, name);
  modal.querySelector('[data-act=close]').onclick = close;
}
