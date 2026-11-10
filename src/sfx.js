// sfx.js — 消しバトの効果音（Web Audioで生成・音声ファイル不要）
// 使い方：
//   KeshiSfx.unlock()                 … 最初のタップで1回呼ぶ（iPadで音を出すため）
//   KeshiSfx.play('flick')            … 弾いたとき
//   KeshiSfx.play('hit', {strength})  … ぶつかったとき（strengthは0.3〜1）
//   KeshiSfx.play('fall')             … 机から落ちたとき
//   KeshiSfx.play('win')              … 勝ったとき
//   KeshiSfx.preview(cat, id)         … 設定画面での試し聞き
//   KeshiSfx.setChoice(cat, id) / setVolume(0〜1) / setMuted(true/false) / getSettings()
// 設定はこの端末のlocalStorageに自動で保存されます。

const KeshiSfx = (() => {
  const CATS = [
    {key:'flick', label:'弾く', opts:[
      {id:'real',  name:'リアル',   word:'ペチッ'},
      {id:'real2', name:'デコピン', word:'パチン'},
      {id:'soft',  name:'やわらか', word:'ピッ'},
      {id:'chip',  name:'ピコピコ', word:'ピッ'},
      {id:'game',  name:'ゲーム',   word:'シュッ'},
      {id:'weird', name:'へんてこ', word:'ビヨ〜ン'}]},
    {key:'hit', label:'ぶつかる', opts:[
      {id:'real',  name:'リアル',   word:'コツン'},
      {id:'real2', name:'かため',   word:'カツン'},
      {id:'soft',  name:'やわらか', word:'ポコッ'},
      {id:'chip',  name:'ピコピコ', word:'コッ'},
      {id:'game',  name:'ゲーム',   word:'ドカッ'},
      {id:'weird', name:'へんてこ', word:'プキュッ'}]},
    {key:'fall', label:'落ちる', opts:[
      {id:'real',  name:'リアル',   word:'ヒュ〜…コトン'},
      {id:'real2', name:'バウンド', word:'コトン…コロコロ'},
      {id:'soft',  name:'やわらか', word:'ひゅ〜ん'},
      {id:'chip',  name:'ピコピコ', word:'ピュ〜ン'},
      {id:'game',  name:'ゲーム',   word:'ヒューン…ドーン'},
      {id:'weird', name:'へんてこ', word:'あ〜れ〜'}]},
    {key:'win', label:'勝ち', opts:[
      {id:'real2', name:'拍手',         word:'パチパチ'},
      {id:'real',  name:'ベル',         word:'キラッ'},
      {id:'soft',  name:'ファンファーレ', word:'パパーン'},
      {id:'chip',  name:'ピコピコ',     word:'ピロリン'},
      {id:'game',  name:'ゲーム',       word:'ジャジャーン'},
      {id:'weird', name:'へんてこ',     word:'プピ〜♪'}]}
  ];

  const KEY = 'keshibato-sfx-settings';
  const DEFAULTS = {choice:{flick:'real', hit:'real', fall:'real', win:'real'}, volume:0.8, muted:false};
  let settings = load();

  function load(){
    try{
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if(s) return {choice:{...DEFAULTS.choice, ...(s.choice||{})},
        volume: typeof s.volume === 'number' ? s.volume : DEFAULTS.volume, muted: !!s.muted};
    }catch(e){}
    return structuredClone(DEFAULTS);
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(settings)); }catch(e){} }

  // ---------- 音のエンジン ----------
  let ctx, master, noiseBuf;
  function ac(){
    if(!ctx){
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = settings.volume;
      master.connect(comp).connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
    }
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function env(g, t, a, peak, dec){
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone({type='sine', f0, f1, t, a=0.003, dec, peak, glide}){
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if(f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || a + dec));
    const g = ctx.createGain(); env(g, t, a, peak, dec);
    o.connect(g).connect(master); o.start(t); o.stop(t + a + dec + 0.05);
    return o;
  }
  function noise({t, a=0.002, dec, peak, filter='bandpass', f0, f1, q=1}){
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = filter;
    fl.frequency.setValueAtTime(f0, t);
    if(f1) fl.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
    fl.Q.value = q;
    const g = ctx.createGain(); env(g, t, a, peak, dec);
    s.connect(fl).connect(g).connect(master); s.start(t); s.stop(t + a + dec + 0.05);
  }
  function vib(o, t, rate, depth, dur){
    const l = ctx.createOscillator(); l.frequency.value = rate;
    const g = ctx.createGain(); g.gain.value = depth;
    l.connect(g).connect(o.frequency); l.start(t); l.stop(t + dur);
  }

  // ---------- 効果音 ----------
  const SFX = {
    flick:{
      real(t){ noise({t, dec:.03, peak:.55, f0:3200, q:.9}); tone({f0:2400, f1:1500, t, dec:.035, peak:.18}); },
      real2(t){ noise({t, dec:.045, peak:.7, f0:2000, q:1.2}); tone({f0:1400, f1:600, t, dec:.05, peak:.22}); },
      soft(t){ tone({f0:1150, f1:1750, t, a:.004, dec:.07, peak:.4}); },
      chip(t){ tone({type:'square', f0:1050, t, dec:.05, peak:.12}); },
      game(t){ noise({t, a:.01, dec:.12, peak:.35, f0:1200, f1:4500, q:3}); tone({f0:600, f1:1400, t, a:.01, dec:.1, peak:.08}); },
      weird(t){ const o = tone({type:'triangle', f0:220, f1:440, t, a:.005, dec:.45, peak:.35, glide:.1}); vib(o, t, 18, 70, .5); }
    },
    hit:{
      real(t, s){ const k = .92 + .16*s;
        tone({f0:980*k, f1:780*k, t, dec:.09, peak:.55*s});
        tone({type:'triangle', f0:2150*k, f1:1950*k, t, dec:.035, peak:.16*s});
        noise({t, dec:.012, peak:.4*s, f0:1900, q:2}); },
      real2(t, s){ tone({f0:1700, f1:1500, t, dec:.05, peak:.4*s}); tone({type:'triangle', f0:3400, t, dec:.02, peak:.15*s}); noise({t, dec:.01, peak:.45*s, f0:3500, q:3}); },
      soft(t, s){ tone({f0:540, f1:300, t, dec:.13, peak:.55*s}); noise({t, dec:.02, peak:.15*s, filter:'lowpass', f0:900}); },
      chip(t, s){ tone({type:'square', f0:330, f1:220, t, dec:.05, peak:.14*s}); },
      game(t, s){ noise({t, dec:.12, peak:.7*s, filter:'lowpass', f0:1500, f1:300}); tone({f0:140, f1:60, t, dec:.15, peak:.6*s}); tone({type:'square', f0:200, f1:80, t, dec:.06, peak:.08*s}); },
      weird(t, s){ const a = tone({type:'triangle', f0:900, f1:1900, t, a:.01, dec:.08, peak:.3*s, glide:.06}); vib(a, t, 30, 80, .1); tone({type:'triangle', f0:1900, f1:1200, t:t+.07, a:.005, dec:.09, peak:.25*s}); }
    },
    fall:{
      real(t){
        noise({t, a:.06, dec:.55, peak:.28, f0:2600, f1:380, q:5});
        tone({f0:1300, f1:340, t, a:.03, dec:.55, peak:.05});
        const l = t + .78;
        tone({f0:170, f1:105, t:l, dec:.2, peak:.7});
        noise({t:l, dec:.07, peak:.45, filter:'lowpass', f0:600});
        tone({f0:190, f1:140, t:l+.2, dec:.08, peak:.22});
        noise({t:l+.2, dec:.04, peak:.15, filter:'lowpass', f0:600}); },
      real2(t){
        noise({t, a:.05, dec:.4, peak:.22, f0:2200, f1:450, q:5});
        const l = t + .6;
        [[0,.6],[.2,.3],[.34,.16],[.44,.09],[.51,.05]].forEach(([d,p])=>{
          tone({f0:260, f1:200, t:l+d, dec:.06, peak:p}); noise({t:l+d, dec:.03, peak:p*.7, f0:1400, q:2}); }); },
      soft(t){ const o = tone({f0:1000, f1:170, t, a:.02, dec:.75, peak:.35, glide:.75}); vib(o, t, 9, 30, .8); },
      chip(t){
        const o = ctx.createOscillator(); o.type = 'square';
        for(let i=0;i<10;i++) o.frequency.setValueAtTime(900*Math.pow(.8,i), t + i*.06);
        const g = ctx.createGain(); env(g, t, .003, .11, .6);
        o.connect(g).connect(master); o.start(t); o.stop(t + .7); },
      game(t){
        tone({f0:1200, f1:150, t, a:.02, dec:.8, peak:.25, glide:.8});
        const l = t + .85;
        noise({t:l, dec:.55, peak:.65, filter:'lowpass', f0:900, f1:90});
        tone({f0:90, f1:38, t:l, dec:.5, peak:.6}); },
      weird(t){
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(130, t + 1.1);
        const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 850; fl.Q.value = 3;
        const g = ctx.createGain(); env(g, t, .05, .45, 1.05);
        o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t + 1.2); vib(o, t, 6, 18, 1.2); }
    },
    win:{
      real(t){
        [1568, 2093, 2637].forEach((f,i)=>{ const s = t + i*.075;
          tone({f0:f, t:s, dec:i===2 ? .7 : .35, peak:.22}); tone({f0:f*2.01, t:s, dec:.2, peak:.05}); });
        noise({t:t+.15, a:.01, dec:.35, peak:.05, filter:'highpass', f0:6500}); },
      real2(t){
        const clap = (s, p, f)=>{
          [0, .006, .013].forEach((d,i)=> noise({t:s+d, a:.0008, dec:.005, peak:p*(1-i*.2), f0:f, q:.7}));
          noise({t:s+.016, a:.001, dec:.05, peak:p*.35, filter:'highpass', f0:f*.8, q:.7});
        };
        for(let c=0;c<10;c++){
          const rate = 5 + Math.random()*1.5, f = 2000 + Math.random()*1800;
          let s = t + Math.random()*.1;
          while(s < t + 1.4){
            const p = .5*(1 - (s-t)/1.8) * (.7 + Math.random()*.3);
            clap(s, p, f);
            s += 1/rate + (Math.random()-.5)*.03;
          }
        } },
      soft(t){
        [523, 659, 784].forEach((f,i)=> tone({type:'triangle', f0:f, t:t+i*.1, dec:.12, peak:.3}));
        tone({type:'triangle', f0:1047, t:t+.3, dec:.7, peak:.32}); tone({f0:2094, t:t+.3, dec:.4, peak:.06}); },
      chip(t){
        [784, 988, 1175, 1568].forEach((f,i)=> tone({type:'square', f0:f, t:t+i*.055, dec:i===3 ? .3 : .07, peak:.1})); },
      game(t){
        [784, 1047, 1319, 1568].forEach((f,i)=> tone({type:'square', f0:f, t:t+i*.06, dec:.06, peak:.07}));
        [1047, 1319, 1568].forEach(f=>{ tone({type:'triangle', f0:f, t:t+.3, a:.01, dec:.8, peak:.2}); tone({type:'square', f0:f, t:t+.3, a:.01, dec:.4, peak:.03}); }); },
      weird(t){
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(480, t); o.frequency.linearRampToValueAtTime(720, t + .12); o.frequency.setValueAtTime(720, t + .7);
        const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 1400; fl.Q.value = 2;
        const g = ctx.createGain(); env(g, t, .03, .35, .75);
        o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t + .9); vib(o, t+.15, 12, 25, .7);
        tone({f0:900, f1:1400, t:t+.8, dec:.12, peak:.15}); }
    }
  };

  // ---------- 公開する関数 ----------
  let lastHit = 0;
  function play(cat, {id, strength = .8, force = false} = {}){
    if(settings.muted && !force) return;
    ac();
    const now = ctx.currentTime;
    if(cat === 'hit' && !force){
      if(now - lastHit < .05) return; // 一瞬で何回もぶつかったときに鳴りすぎないように
      lastHit = now;
    }
    const s = Math.min(1, Math.max(.3, strength));
    const fn = SFX[cat] && SFX[cat][id || settings.choice[cat]];
    if(fn) fn(now + .01, s);
  }
  return {
    CATS,
    unlock(){ ac(); },
    play,
    preview(cat, id){ play(cat, {id, force:true}); },
    setChoice(cat, id){ settings.choice[cat] = id; save(); },
    setVolume(v){ settings.volume = v; if(master) master.gain.value = v; save(); },
    setMuted(m){ settings.muted = !!m; save(); },
    getSettings(){ return structuredClone(settings); },
    reset(){ settings = structuredClone(DEFAULTS); if(master) master.gain.value = settings.volume; save(); }
  };
})();

window.KeshiSfx = KeshiSfx;
