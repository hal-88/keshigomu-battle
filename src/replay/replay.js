// 試合の ふりかえり：試合の はじめから 終わりまでを 記録して、あとで 画面で 見なおせる（画面録画で シェアできる）。
//
// ・対戦中は 画面の様子（Game.getState() を 小さくしたもの）と カメラ・ねらいの 矢印を 30コマ/秒で 記録する。
//   ねらっている（考えている）間は、それぞれの 番の 最後の 2秒だけ 残す。
// ・机の上の もの（ワックス・こおり・牛乳・小石・竹・ガス栓など）も コマごとに 写しておく
//   （そのままだと 最後の 状態が ずっと 出てしまうので）。
// ・演出（文字・火花・ゆれ）も 時間ごとに 記録して、ふりかえりで もう一度 出す。
// ・だれかが 落ちたときの 時間も 記録して、ふりかえりの バーに しるしを つける。

import { packView } from '../online/viewCodec.js';

const FRAME_MS = 33; // 30コマ/秒
const AIM_KEEP_MS = 2000; // ねらっている間は 最後の 2秒だけ

export function createReplayRecorder() {
  const frames = [];
  const fx = []; // 演出の 記録
  const marks = []; // 落ちた とき { t, text }
  let lastT = -1e9;
  let lastSt = null;
  let firstDesk = null; // はじめの 机（サドンデスで 小さくなる 前。画面の 大きさは これで きめる）
  let flip = false;

  return {
    /** 毎コマ よぶ（間引きは ここで する） */
    frame(now, st, aim, cam, isFlip = false) {
      lastSt = st;
      flip = isFlip;
      if (!firstDesk) firstDesk = { ...st.desk, shape: { ...st.desk.shape } };
      if (now - lastT < FRAME_MS) return;
      lastT = now;
      const f = {
        t: now,
        turn: st.turnCount ?? 0,
        aimPhase: st.phase === 'aim',
        view: packView(st),
        desk: snapDesk(st),
        aim: aim ? { ...aim } : null,
        cam: { ...cam },
      };
      frames.push(f);
      if (f.aimPhase) {
        // ねらっている間は 最後の 2秒だけ（考えている時間は いらない）
        let i = frames.length - 1;
        while (i > 0 && frames[i - 1].aimPhase) i--;
        let n = 0;
        while (i + n < frames.length - 1 && frames[i + n].t < now - AIM_KEEP_MS) n++;
        if (n) {
          frames.splice(i, n);
          frames[i].cut = true; // ここで 時間が とんでいる（あとで つめる）
        }
      }
    },
    /** 演出（renderer.addEffect / shake） */
    effect(now, kind, args) {
      fx.push({ t: now, kind, args });
    },
    /** だれかが 落ちた */
    knockout(now, info) {
      marks.push({ t: now, ...info });
    },
    /** 試合が 終わったとき：ふりかえりの データ（コマが すくなければ null） */
    finish() {
      if (frames.length < 10) return null;
      // コマの 時間を つめる（考えている 時間を 消した ぶん、すきまが できるので）
      const out = [];
      let shift = 0;
      let prev = frames[0].t;
      const remap = []; // [もとの時間, つめた時間]
      for (const f of frames) {
        const gap = f.t - prev;
        if (f.cut && gap > FRAME_MS) shift += gap - FRAME_MS; // 消した ねらいの 時間だけ つめる（おそい 端末の すきまは そのまま）
        prev = f.t;
        const t = f.t - shift;
        remap.push([f.t, t]);
        out.push({ ...f, t });
      }
      const mapTime = (t0) => {
        // もとの 時間 → つめた 時間（いちばん 近い コマで）
        let lo = 0;
        let hi = remap.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (remap[mid][0] <= t0) lo = mid;
          else hi = mid - 1;
        }
        return remap[lo][1] + Math.max(0, t0 - remap[lo][0]);
      };
      const start = out[0].t;
      const end = out[out.length - 1].t;
      return {
        frames: out,
        fx: fx.filter((x) => x.t >= frames[0].t).map((x) => ({ ...x, t: mapTime(x.t) })),
        marks: marks.map((m) => ({ ...m, t: mapTime(m.t) })),
        start,
        end,
        base: lastSt,
        desk: firstDesk,
        flip,
      };
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
