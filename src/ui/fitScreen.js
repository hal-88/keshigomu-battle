// 画面を スマホ・タブレットの大きさに 自動で合わせる（ページが スクロールしないように）
//
// ・ふつうの画面：中身が はみ出すときは、まるごと 小さくして 1画面に おさめる
// ・数が多い一覧（消しゴムを選ぶ・図鑑）：.fit-scroll をつけた 一覧の中だけ スクロール。
//   見出しと ボタンは いつも 画面に出ている

const MIN_SCALE = 0.45; // これより 小さくは しない（字が 読めなくなるので）

let current = null; // { el, ro, mo, raf }

/** el（.screen）の中の .screen-in を、画面に おさめる */
export function fitScreen(el) {
  const inner = el?.querySelector(':scope > .screen-in');
  if (!inner) return;
  // いったん 元の大きさに もどして 測る
  inner.classList.remove('scaled');
  inner.style.transform = '';
  inner.style.width = '';
  inner.style.height = '';
  const hasScroll = !!inner.querySelector('.fit-scroll');
  inner.classList.toggle('has-scroll', hasScroll);
  if (hasScroll) return; // 一覧の中だけ スクロール
  const W = el.clientWidth;
  const H = el.clientHeight;
  const needH = inner.scrollHeight;
  const needW = inner.scrollWidth;
  if (!W || !H || !needH) return;
  const z = Math.max(MIN_SCALE, Math.min(1, H / needH, W / needW));
  if (z >= 0.995) return;
  inner.classList.add('scaled');
  inner.style.width = `${W / z}px`;
  inner.style.height = `${H / z}px`;
  inner.style.transform = `scale(${z})`;
}

/** 新しい画面を出したら呼ぶ。大きさが かわったり、中身が かわったりしたら 合わせなおす */
export function watchFit(el) {
  stopFit();
  const schedule = () => {
    if (!current || current.el !== el) return;
    cancelAnimationFrame(current.raf);
    current.raf = requestAnimationFrame(() => fitScreen(el));
  };
  current = { el, raf: 0, ro: null, mo: null };
  const inner = el.querySelector(':scope > .screen-in');
  if (!inner) return; // 対戦画面などは 自分で 合わせている
  current.ro = new ResizeObserver(schedule);
  current.ro.observe(el);
  // 中身が かわったら（待合室・トーナメント表・ガチャなど）合わせなおす
  current.mo = new MutationObserver((list) => {
    // transform や style を 自分で かえたときは 無視
    if (list.every((m) => m.type === 'attributes' && m.target === inner)) return;
    schedule();
  });
  current.mo.observe(inner, { childList: true, subtree: true, characterData: true });
  schedule();
  // 字（Webフォント）や 絵が そろってから もう一度
  document.fonts?.ready.then(schedule);
  setTimeout(schedule, 300);
}

export function stopFit() {
  if (!current) return;
  cancelAnimationFrame(current.raf);
  current.ro?.disconnect();
  current.mo?.disconnect();
  current = null;
}
