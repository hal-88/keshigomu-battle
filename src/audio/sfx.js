// 効果音。音のファイルは使わず、ブラウザの中で音を作る（Web Audio）。
// iPad などは「画面を触ったあと」でないと音が出せないので、最初のタッチで unlockAudio() を呼ぶ。

let ctx = null;
let master = null;
let muted = false;
try {
  muted = localStorage.getItem('keshigomu-muted') === '1';
} catch {
  /* 保存できない環境でも動く */
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem('keshigomu-muted', m ? '1' : '0');
  } catch {
    /* 無視 */
  }
}

function ready() {
  return ctx && !muted && ctx.state === 'running';
}

function tone({ freq, freqEnd, dur = 0.1, type = 'sine', gain = 0.2, delay = 0 }) {
  if (!ready()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise({ dur = 0.1, gain = 0.2, freq = 2000, freqEnd, q = 1, type = 'bandpass', delay = 0 }) {
  if (!ready()) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

let lastHit = 0;

export const sfx = {
  tap() {
    tone({ freq: 660, dur: 0.05, type: 'triangle', gain: 0.12 });
  },
  flick(power = 1) {
    noise({ dur: 0.06, gain: 0.2 + 0.2 * power, freq: 2500, q: 0.8 });
    tone({ freq: 200, freqEnd: 80, dur: 0.09, type: 'triangle', gain: 0.25 });
  },
  hit(power = 5, pencil = false) {
    const now = performance.now();
    if (now - lastHit < 60) return; // 鳴らしすぎない
    lastHit = now;
    const p = Math.min(1, power / 14);
    if (pencil) {
      tone({ freq: 900, freqEnd: 700, dur: 0.08, type: 'square', gain: 0.05 + 0.08 * p });
    } else {
      tone({ freq: 260 + 200 * p, freqEnd: 120, dur: 0.08, type: 'triangle', gain: 0.12 + 0.22 * p });
      noise({ dur: 0.05, gain: 0.08 + 0.2 * p, freq: 1800, q: 1.2 });
    }
  },
  fall() {
    tone({ freq: 800, freqEnd: 110, dur: 0.7, type: 'sine', gain: 0.22 });
    tone({ freq: 90, freqEnd: 50, dur: 0.25, type: 'sine', gain: 0.3, delay: 0.65 });
  },
  hold() {
    tone({ freq: 220, freqEnd: 520, dur: 0.18, type: 'triangle', gain: 0.22 });
    tone({ freq: 660, dur: 0.12, type: 'triangle', gain: 0.15, delay: 0.16 });
  },
  flip() {
    noise({ dur: 0.18, gain: 0.15, freq: 900, freqEnd: 3000, q: 0.7 });
  },
  rare() {
    [1047, 1319, 1568, 2093].forEach((f, i) =>
      tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.12, delay: i * 0.07 }),
    );
  },
  card() {
    tone({ freq: 400, freqEnd: 1200, dur: 0.22, type: 'sine', gain: 0.18 });
    tone({ freq: 1600, dur: 0.15, type: 'triangle', gain: 0.08, delay: 0.18 });
  },
  whoosh() {
    noise({ dur: 0.35, gain: 0.25, freq: 400, freqEnd: 4000, q: 1.5 });
  },
  quake() {
    noise({ dur: 1.0, gain: 0.45, freq: 140, q: 0.7, type: 'lowpass' });
    tone({ freq: 55, freqEnd: 40, dur: 1.0, type: 'sawtooth', gain: 0.08 });
  },
  boing() {
    tone({ freq: 380, freqEnd: 120, dur: 0.35, type: 'sawtooth', gain: 0.12 });
    tone({ freq: 300, freqEnd: 90, dur: 0.5, type: 'sawtooth', gain: 0.1, delay: 0.3 });
  },
  big() {
    tone({ freq: 120, freqEnd: 60, dur: 0.4, type: 'triangle', gain: 0.35 });
  },
  warn() {
    tone({ freq: 880, dur: 0.12, type: 'square', gain: 0.07 });
    tone({ freq: 880, dur: 0.12, type: 'square', gain: 0.07, delay: 0.2 });
  },
  crumble() {
    noise({ dur: 0.45, gain: 0.3, freq: 600, freqEnd: 200, q: 0.8 });
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.18, delay: i * 0.12 }));
    tone({ freq: 1047, dur: 0.5, type: 'triangle', gain: 0.15, delay: 0.5 });
  },
  lose() {
    [392, 349, 311, 262].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.16, delay: i * 0.18 }));
  },
  draw() {
    [440, 440, 330].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.14, delay: i * 0.16 }));
  },
};
