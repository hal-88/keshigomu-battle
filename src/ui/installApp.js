// アプリとしてホーム画面に置く（PWA）ためのしくみ
// ・オフラインでも動くように、サービスワーカー（public/sw.js）を登録する
// ・タイトル画面の「📲 アプリにする」で、端末ごとのやり方を見せる

let deferredPrompt = null; // Chrome・Chromebook・Android の「インストール」の合図

export function setupPwa() {
  // 開発中（npm run dev）は登録しない（プログラムを直してもすぐ反映されるように）
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

/** もうアプリとして開いているか（ホーム画面のアイコンから開いたか） */
export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 「アプリにする」の説明を出す（el の上にかさねる） */
export function showInstallGuide(el) {
  const ov = document.createElement('div');
  ov.className = 'overlay fixed show';
  let body;
  if (deferredPrompt) {
    body = `
      <p>ボタンを おすと、この ゲームが アプリとして ホーム画面（デスクトップ）に入るよ。</p>
      <button class="btn big primary" data-act="install">📲 インストール</button>`;
  } else if (isIos()) {
    body = `
      <ol class="install-steps">
        <li>Safari の 上か下にある <b>共有ボタン</b>（四角から ↑ が出ている マーク）を おす</li>
        <li><b>「ホーム画面に追加」</b>を えらぶ（見つからないときは、下にスクロール）</li>
        <li>右上の <b>「追加」</b>を おす</li>
      </ol>
      <p class="note">ホーム画面の 消しゴムの アイコンから ひらくと、ぜんぶの画面で 遊べるよ。</p>`;
  } else {
    body = `
      <ol class="install-steps">
        <li>Chrome の 右上の <b>︙</b>（メニュー）を おす</li>
        <li><b>「アプリをインストール」</b> または <b>「ホーム画面に追加」</b>を えらぶ</li>
      </ol>
      <p class="note">アドレスバーの右はしに インストールの マークが 出ていることも あるよ。</p>`;
  }
  ov.innerHTML = `
    <div class="modal detail install-guide">
      <img src="./icons/icon-192.png" alt="" class="install-icon">
      <div class="detail-name">アプリにする</div>
      ${body}
      <p class="note">一度ひらいておけば、インターネットが なくても CPU戦や「1台でみんなで」が 遊べるよ（オンラインは インターネットが いるよ）。</p>
      <button class="btn" data-act="close">とじる</button>
    </div>`;
  el.appendChild(ov);
  ov.addEventListener('click', async (e) => {
    if (e.target.closest('[data-act=install]') && deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      ov.remove();
      return;
    }
    if (e.target === ov || e.target.closest('[data-act=close]')) ov.remove();
  });
}
