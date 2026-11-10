// 名場面リプレイ：消しゴムが 落ちた（倒した・倒された）場面を、4ターン前から 動画にする。
//
// ・対戦中は 画面の様子（Game.getState() を 小さくしたもの）を 30コマ/秒で 記録しておく。
//   動画は 作らないので、対戦中は 重くならない。ねらっている間は 最後の 2秒だけ 残す。
// ・だれかが 落ちたら、その 4ターン前から 落ちて 2.6秒後までを 切りとって「クリップ」にする。
// ・机の上の もの（ワックス・こおり・牛乳・小石・竹・ガス栓など）も コマごとに 写しておく
//   （そのままだと 最後の 状態が ずっと 出てしまうので）。
// ・「動画にする」を 押したら、クリップを 見えないキャンバスに もう一度 かいて、
//   MediaRecorder で 動画（mp4 か webm）にする。音は 入らない。

import { packView, unpackView } from '../online/viewCodec.js';
import { CanvasRenderer } from '../render/CanvasRenderer.js';

const FRAME_MS = 33; // 30コマ/秒
const AIM_KEEP_MS = 2000; // ねらっている間は 最後の 2秒だけ
const AFTER_MS = 2600; // 落ちてから ここまで 入れる（スローの 演出）
const MAX_CLIPS = 3;

export function createReplayRecorder() {
  const turns = new Map(); // turnCount → コマの ならび
  const fx = []; // 演出（文字・火花・ゆれ）の 記録
  const pending = []; // 落ちたけど まだ 切りとっていない もの
  const clips = [];
  let lastT = -1e9;
  let lastSt = null;

  function cut(p, now) {
    const frames = [];
    for (const k of [p.turn - 3, p.turn - 2, p.turn - 1, p.turn, p.turn + 1, p.turn + 2]) {
      for (const f of turns.get(k) || []) if (f.t <= p.until) frames.push(f);
    }
    if (frames.length < 5) return;
    const start = frames[0].t;
    const end = Math.min(p.until, frames[frames.length - 1].t, now);
    clips.push({
      frames,
      fx: fx.filter((x) => x.t >= start && x.t <= end),
      start,
      end,
      info: p.info,
      base: lastSt,
      flip: p.flip,
    });
    while (clips.length > MAX_CLIPS) clips.shift();
  }

  return {
    /** 毎コマ よぶ（間引きは ここで する） */
    frame(now, st, aim, cam) {
      lastSt = st;
      for (let i = pending.length - 1; i >= 0; i--) {
        if (now >= pending[i].until) cut(pending.splice(i, 1)[0], now);
      }
      if (now - lastT < FRAME_MS) return;
      lastT = now;
      const turn = st.turnCount ?? 0;
      let list = turns.get(turn);
      if (!list) {
        list = [];
        turns.set(turn, list);
        for (const k of [...turns.keys()]) if (k < turn - 5) turns.delete(k);
      }
      const f = { t: now, aimPhase: st.phase === 'aim', view: packView(st), desk: snapDesk(st), aim: aim ? { ...aim } : null, cam: { ...cam } };
      list.push(f);
      if (f.aimPhase) {
        // ねらっている間は 最後の 2秒だけ（考えている時間は 動画に いらない）
        let i = list.length - 1;
        while (i > 0 && list[i - 1].aimPhase) i--;
        let n = 0;
        while (i + n < list.length - 1 && list[i + n].t < now - AIM_KEEP_MS) n++;
        if (n) list.splice(i, n);
      }
    },
    /** 演出（renderer.addEffect / shake）も 記録して、動画で もう一度 出す */
    effect(now, kind, args) {
      fx.push({ t: now, kind, args });
      while (fx.length && fx[0].t < now - 60000) fx.shift();
    },
    /** だれかが 落ちた。info は 画面に出す 文字など。flip は 机を 回して 見ているか */
    knockout(now, turn, info, flip = false) {
      pending.push({ turn, until: now + AFTER_MS, info, flip });
    },
    /** 試合が 終わったとき：まだの ものも 切りとって、クリップを かえす（新しい じゅん） */
    finish(now) {
      while (pending.length) cut(pending.shift(), now);
      return [...clips].reverse();
    },
  };
}

/** 机の上の もの（あとから かわるもの）を コマごとに 写す */
function snapDesk(st) {
  return {
    waxZones: (st.waxZones || []).map((z) => ({ ...z })),
    bamboo: st.bamboo ? { ...st.bamboo } : null,
    stuck: st.stuck ? { ...st.stuck } : null,
    posts: (st.posts || []).map((p) => ({ ...p })),
  };
}

/** この端末で 作れる 動画の 形式（SNS に 出しやすい mp4 を 先に） */
export function videoMime() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  const list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

/**
 * クリップを 動画に する（クリップの 長さ ぶん 時間が かかる）
 * @returns {Promise<{ blob: Blob, ext: string, type: string }>}
 */
export async function makeReplayVideo(clip, onProgress) {
  const mime = videoMime();
  if (!mime) throw new Error('この端末では 動画を 作れないよ');
  // 見えないところに 1280×720 の キャンバスを 置く
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position: 'fixed', left: '-10000px', top: '0', width: `${1280 / dpr}px`, height: `${720 / dpr}px`, pointerEvents: 'none' });
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
  wrap.appendChild(canvas);
  document.body.appendChild(wrap);
  const r = new CanvasRenderer(canvas);
  r.flip = !!clip.flip;
  r.resize(clip.base.desk);

  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => (rec.onstop = res));
  rec.start(250);

  const dur = clip.end - clip.start;
  // 次の コマ：ふつうは requestAnimationFrame。画面が かくれて 止まっても タイマーで すすむ
  const next = (fn) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      fn();
    };
    requestAnimationFrame(go);
    setTimeout(go, 40);
  };
  const T0 = performance.now();
  let fi = 0;
  let xi = 0;
  try {
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        const ct = clip.start + (now - T0);
        while (fi + 1 < clip.frames.length && clip.frames[fi + 1].t <= ct) fi++;
        while (xi < clip.fx.length && clip.fx[xi].t <= ct) {
          const x = clip.fx[xi++];
          if (x.kind === 'shake') r.shake(...x.args);
          else r.addEffect({ ...x.args });
        }
        const f = clip.frames[fi];
        const st = unpackView(f.view, clip.base);
        if (f.desk) Object.assign(st, f.desk); // その コマの 机の上の もの
        r.setCamera(f.cam.x, f.cam.y, f.cam.zoom);
        r.draw(st, f.aim, now);
        drawCaption(r.ctx, canvas.width, canvas.height, clip.info, now - T0, dur);
        onProgress?.(Math.min(1, (now - T0) / dur));
        if (now - T0 < dur + 400) next(tick);
        else resolve();
      };
      next(tick);
    });
  } finally {
    rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    wrap.remove();
  }
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm', type };
}

// 動画の 上の 文字（だれが だれを 落としたか）と、下の ロゴ
function drawCaption(ctx, W, H, info, t, dur) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const s = W / 1280;
  ctx.font = `800 ${34 * s}px "M PLUS Rounded 1c", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const msg = info?.text || '名場面';
  const tw = ctx.measureText(msg).width + 48 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect?.(W / 2 - tw / 2, 18 * s, tw, 58 * s, 29 * s);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(msg, W / 2, 47 * s);
  // ロゴ
  ctx.font = `800 ${26 * s}px "M PLUS Rounded 1c", sans-serif`;
  ctx.textAlign = 'right';
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeText('消しゴムバトル', W - 22 * s, H - 28 * s);
  ctx.fillStyle = '#ffd54f';
  ctx.fillText('消しゴムバトル', W - 22 * s, H - 28 * s);
  // のこり（下の 線）
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(0, H - 6 * s, (W * Math.min(1, t / dur)), 6 * s);
  ctx.restore();
}

/** できた 動画を シェア（スマホ・タブレット）。できなければ 保存する */
export async function shareOrSave(video, title) {
  const name = `keshigomu-battle-${Date.now()}.${video.ext}`;
  const file = new File([video.blob], name, { type: video.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: `${title} #消しゴムバトル` });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancel';
    }
  }
  saveVideo(video, name);
  return 'saved';
}

export function saveVideo(video, name = `keshigomu-battle-${Date.now()}.${video.ext}`) {
  const url = URL.createObjectURL(video.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
