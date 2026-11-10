// 結果画面の「📹 名場面を 動画に」。ボタン → 動画を 作る → 見る・シェア・保存
import { videoMime, makeReplayVideo, shareOrSave, saveVideo } from './replay.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 結果画面に 入れる HTML（名場面が ない・動画が 作れない 端末では 空） */
export function clipsHTML(clips) {
  if (!clips?.length || !videoMime()) return '';
  return `<div class="replay-box">
      <div class="replay-title">📹 名場面を 動画に（シェア・保存 できるよ）</div>
      <div class="replay-list">${clips
        .map((c, i) => `<button class="btn small replay-btn" data-clip="${i}">🎬 ${esc(c.info?.text || '名場面')}</button>`)
        .join('')}</div>
    </div>`;
}

/** ボタンを つなぐ */
export function bindClips(root, clips) {
  root.querySelectorAll('[data-clip]').forEach((b) => {
    b.onclick = () => openClip(root, clips[Number(b.dataset.clip)]);
  });
}

async function openClip(root, clip) {
  if (!clip) return;
  const ov = document.createElement('div');
  ov.className = 'overlay fixed show';
  ov.innerHTML = `<div class="modal replay-modal">
      <div class="replay-head">🎬 動画を 作っているよ…</div>
      <div class="replay-bar"><span></span></div>
      <p class="note">少し 待ってね（動画の 長さ ぶん かかるよ）</p>
    </div>`;
  root.appendChild(ov);
  const modal = ov.querySelector('.modal');
  const bar = ov.querySelector('.replay-bar span');
  let url = null;
  const close = () => {
    if (url) URL.revokeObjectURL(url);
    ov.remove();
  };
  let video;
  try {
    video = await makeReplayVideo(clip, (p) => (bar.style.width = `${Math.round(p * 100)}%`));
  } catch (e) {
    modal.innerHTML = `<p>${esc(e?.message || '動画を 作れなかったよ')}</p><button class="btn" data-act="close">閉じる</button>`;
    modal.querySelector('[data-act=close]').onclick = close;
    return;
  }
  if (!ov.isConnected) return; // 待っている間に 画面が かわった
  url = URL.createObjectURL(video.blob);
  const title = clip.info?.text || '消しゴムバトルの 名場面';
  const testFile = new File([video.blob], `a.${video.ext}`, { type: video.type });
  const canShare = !!navigator.canShare?.({ files: [testFile] });
  modal.innerHTML = `
    <div class="replay-head">🎬 ${esc(title)}</div>
    <video class="replay-video" src="${url}" controls autoplay muted loop playsinline></video>
    <p class="note">音は 入っていないよ。SNS に のせるときは おうちの人に きいてね</p>
    <div class="row">
      ${canShare ? '<button class="btn primary" data-act="share">📤 シェア</button>' : ''}
      <button class="btn ${canShare ? '' : 'primary'}" data-act="save">💾 保存</button>
      <button class="btn ghost" data-act="close">閉じる</button>
    </div>`;
  modal.querySelector('[data-act=share]')?.addEventListener('click', () => shareOrSave(video, title));
  modal.querySelector('[data-act=save]').onclick = () => saveVideo(video);
  modal.querySelector('[data-act=close]').onclick = close;
}
