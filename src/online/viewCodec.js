// 弾いている人の画面の様子（Game.getState()）を、送れる小さな形にする・もどす。
// 消しゴムの絵や形の情報（def）は送らず、id だけ送る（分かれたパカッターだけ形も送る）。

import { findEraser } from '../config/erasers.js';
import { findCard } from '../config/cards.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

function packPiece(e) {
  return {
    pid: e.pid,
    pi: e.playerIndex,
    d: e.def.id,
    h: e.def.look.half ? e.def.shape : 0,
    x: r1(e.x),
    y: r1(e.y),
    a: r3(e.angle),
    al: e.alive ? 1 : 0,
    s: e.size,
    fp: r3(e.fallProgress),
    ex: e.isExtra ? 1 : 0,
    ef: e.effects,
    tr: e.trait,
  };
}

function unpackPiece(p) {
  let def = findEraser(p.d);
  if (p.h) def = { ...def, shape: p.h, look: { ...def.look, half: true } };
  return {
    pid: p.pid,
    playerIndex: p.pi,
    def,
    x: p.x,
    y: p.y,
    angle: p.a,
    alive: !!p.al,
    size: p.s,
    fallProgress: p.fp,
    isExtra: !!p.ex,
    effects: p.ef || {},
    trait: p.tr || {},
  };
}

export function packView(st) {
  return {
    phase: st.phase,
    turnIndex: st.turnIndex,
    deskShape: st.desk.shape,
    pendingShrink: st.pendingShrink,
    waxZones: st.waxZones,
    pencils: st.pencils.map((pc) => ({ ...pc, x: r1(pc.x), y: r1(pc.y), angle: r3(pc.angle) })),
    erasers: st.erasers.map(packPiece),
    extras: st.extras.map(packPiece),
    debris: st.debris.map(packPiece),
    junk: (st.junk || []).map((j) => ({ ...j, x: r1(j.x), y: r1(j.y), angle: r3(j.angle), fallProgress: r3(j.fallProgress) })),
  };
}

/** base は自分の Game.getState()（プレイヤーや机の見た目はそこから使う） */
export function unpackView(v, base) {
  return {
    ...base,
    phase: v.phase,
    turnIndex: v.turnIndex,
    desk: { ...base.desk, shape: v.deskShape },
    pendingShrink: v.pendingShrink || null,
    waxZones: v.waxZones || [],
    pencils: v.pencils || [],
    erasers: (v.erasers || []).map(unpackPiece),
    extras: (v.extras || []).map(unpackPiece),
    debris: (v.debris || []).map(unpackPiece),
    junk: v.junk || [],
    curveActive: false,
  };
}

// ---- 演出のためのできごと（カードの絵などは id で送る） ----
export function packEvent(name, data) {
  const d = { ...data };
  if (d.card) d.card = d.card.id;
  if (d.cards) d.cards = d.cards.map((c) => c.id);
  if (d.shape) delete d.shape;
  return [name, d];
}

export function unpackEvent([name, d]) {
  const data = { ...d };
  if (typeof data.card === 'string') data.card = findCard(data.card);
  if (Array.isArray(data.cards)) data.cards = data.cards.map((id) => findCard(id));
  return [name, data];
}
