// 試合の ふりかえり画面：記録した 試合を はじめから 見なおす（画面録画して シェアできるように）。
// ▶/⏸・⏮⏭（番ごと）・はやさ・バー（落ちた ところに しるし）・「かくす」で ボタンを けして きれいに 録画。

import { unpackView } from '../online/viewCodec.js';
import { CanvasRenderer } from '../render/CanvasRenderer.js';

let lastReplay = null;
/** 前回の 試合（タイトル画面の「前回の 試合を ふりかえる」用。ページを 読みなおすと 消える） */
export const setLastReplay = (r) => {
  if (r) lastReplay = r;
};
export const getLastReplay = () => lastReplay;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function openReplayViewer(replay, { title = '試合の ふりかえり', onClose } = {}) {
  if (!replay?.frames?.length) return;
  const { frames, fx, marks, start, end } = replay;
  const dur = Math.max(1, end - start);
  const pct = (t) => `${(((t - start) / dur) * 100).toFixed(2)}%`;

  const root = document.createElement('div');
  root.className = 'replay-viewer';
  root.innerHTML = `
    <canvas class="rv-board"></canvas>
    <div class="rv-top">
      <span class="rv-title">🎬 ${esc(title)}</span>
      <span class="rv-turn" data-el="turn"></span>
    </div>
    <div class="rv-bar">
      <button data-a="prev" aria-label="前の 番">⏮</button>
      <button data-a="play" class="rv-play" aria-label="再生">⏸</button>
      <button data-a="next" aria-label="次の 番">⏭</button>
      <button data-a="speed" class="rv-speed">1倍</button>
      <div class="rv-seek" data-el="seek">
        <div class="rv-fill" data-el="fill"></div>
        ${(marks || []).map((m) => `<span class="rv-mark" style="left:${pct(m.t)};--c:${m.color || '#e53935'}" title="${esc(m.text || '')}"></span>`).join('')}
      </div>
      <button data-a="hide" aria-label="ボタンを かくす">👁 かくす</button>
      <button data-a="close" aria-label="とじる">✕</button>
    </div>
    <div class="rv-hint">画面を タップすると ボタンが もどるよ</div>`;
  document.body.appendChild(root);
  const $ = (n) => root.querySelector(`[data-el=${n}]`);
  const btn = (a) => root.querySelector(`[data-a=${a}]`);

  const canvas = root.querySelector('.rv-board');
  const r = new CanvasRenderer(canvas);
  r.flip = !!replay.flip;
  const desk = replay.desk || replay.base.desk;
  r.resize(desk);
  const ro = new ResizeObserver(() => r.resize(desk));
  ro.observe(canvas);

  // 番の はじまり（⏮⏭ で とぶ ところ）
  const turnStarts = [];
  for (let i = 0; i < frames.length; i++) {
    if (i === 0 || frames[i].turn !== frames[i - 1].turn) turnStarts.push(frames[i].t);
  }

  let ct = start; // いま 見ている 時間
  let playing = true;
  let speed = 1;
  let xi = 0; // 次に 出す 演出
  let fi = 0; // いまの コマ
  let last = performance.now();
  let raf = 0;
  let closed = false;

  const lowerBoundFx = (t) => {
    let lo = 0;
    let hi = fx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fx[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const frameIndex = (t) => {
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (frames[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const seek = (t) => {
    ct = Math.max(start, Math.min(end, t));
    r.effects = []; // とんだら 演出は やりなおし
    xi = lowerBoundFx(ct);
  };
  const setPlaying = (p) => {
    playing = p;
    btn('play').textContent = playing ? '⏸' : '▶';
  };

  function draw(now) {
    fi = frameIndex(ct);
    const f = frames[fi];
    const st = unpackView(f.view, replay.base);
    if (f.desk) Object.assign(st, f.desk);
    r.setCamera(f.cam.x, f.cam.y, f.cam.zoom);
    r.draw(st, f.aim, now);
    $('turn').textContent = `ターン ${f.turn}`;
    $('fill').style.width = pct(ct);
  }

  function tick(now) {
    if (closed) return;
    const dt = Math.min(100, now - last);
    last = now;
    if (playing) {
      ct += dt * speed;
      while (xi < fx.length && fx[xi].t <= ct) {
        const x = fx[xi++];
        if (x.kind === 'shake') r.shake(...x.args);
        else r.addEffect({ ...x.args });
      }
      if (ct >= end) {
        ct = end;
        setPlaying(false);
        btn('play').textContent = '↻'; // 最後まで 見た → もう一度
      }
    }
    draw(now);
    raf = requestAnimationFrame(tick);
  }

  btn('play').onclick = () => {
    if (!playing && ct >= end) seek(start);
    setPlaying(!playing);
  };
  btn('prev').onclick = () => {
    const prev = [...turnStarts].reverse().find((t) => t < ct - 400);
    seek(prev ?? start);
  };
  btn('next').onclick = () => {
    const next = turnStarts.find((t) => t > ct + 50);
    seek(next ?? end);
  };
  btn('speed').onclick = () => {
    speed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1;
    btn('speed').textContent = speed === 0.5 ? '½倍' : `${speed}倍`;
  };
  // バー：さわった ところへ とぶ（なぞっても いい）
  const seekBar = $('seek');
  const seekAt = (ev) => {
    const rect = seekBar.getBoundingClientRect();
    seek(start + ((ev.clientX - rect.left) / rect.width) * dur);
  };
  seekBar.addEventListener('pointerdown', (ev) => {
    seekBar.setPointerCapture?.(ev.pointerId);
    seekAt(ev);
    const move = (e) => seekAt(e);
    const up = () => {
      seekBar.removeEventListener('pointermove', move);
      seekBar.removeEventListener('pointerup', up);
    };
    seekBar.addEventListener('pointermove', move);
    seekBar.addEventListener('pointerup', up);
  });
  // かくす：ボタンを けして きれいな 画面に（録画用）。画面を タップで もどる
  btn('hide').onclick = (ev) => {
    ev.stopPropagation();
    root.classList.add('clean');
  };
  canvas.addEventListener('click', () => root.classList.remove('clean'));
  const close = () => {
    closed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    root.remove();
    onClose?.();
  };
  btn('close').onclick = close;

  seek(start);
  raf = requestAnimationFrame(tick);
  return { close };
}
