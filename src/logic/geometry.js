// 机・消しゴムの形の計算（描画にも物理にも使う純粋な計算だけ）

export function deskSize(desk) {
  const s = desk.shape;
  if (s.type === 'circle') return { w: s.radius * 2, h: s.radius * 2 };
  return { w: s.w, h: s.h };
}

export function isInsideDesk(desk, x, y) {
  const s = desk.shape;
  if (s.type === 'circle') return x * x + y * y <= s.radius * s.radius;
  return Math.abs(x) <= s.w / 2 && Math.abs(y) <= s.h / 2;
}

// 点 (x, y) から方向 (ux, uy)（長さ1）にまっすぐ進んだとき、机のふちまでの距離
export function distanceToEdge(desk, x, y, ux, uy) {
  const s = desk.shape;
  if (s.type === 'circle') {
    const pu = x * ux + y * uy;
    const pp = x * x + y * y;
    return -pu + Math.sqrt(Math.max(0, pu * pu - (pp - s.radius * s.radius)));
  }
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (s.w / 2 - x) / ux);
  if (ux < -1e-9) t = Math.min(t, (-s.w / 2 - x) / ux);
  if (uy > 1e-9) t = Math.min(t, (s.h / 2 - y) / uy);
  if (uy < -1e-9) t = Math.min(t, (-s.h / 2 - y) / uy);
  return Math.max(0, t);
}

// 点から一番近いふちまでの距離（机の外ならマイナス）
export function edgeClearance(desk, x, y) {
  const s = desk.shape;
  if (s.type === 'circle') return s.radius - Math.hypot(x, y);
  return Math.min(s.w / 2 - Math.abs(x), s.h / 2 - Math.abs(y));
}

// 一番近いふちへ向かう向き（長さ1）
export function nearestEdgeDir(desk, x, y) {
  const s = desk.shape;
  if (s.type === 'circle') {
    const d = Math.hypot(x, y) || 1;
    return { x: x / d, y: y / d };
  }
  const dx = s.w / 2 - Math.abs(x);
  const dy = s.h / 2 - Math.abs(y);
  return dx < dy ? { x: Math.sign(x) || 1, y: 0 } : { x: 0, y: Math.sign(y) || 1 };
}

// 机の内側（ふちから margin だけ内側）に点を引きもどす
export function clampInside(desk, x, y, margin = 0) {
  const s = desk.shape;
  if (s.type === 'circle') {
    const r = Math.max(0, s.radius - margin);
    const d = Math.hypot(x, y);
    return d <= r ? { x, y } : { x: (x / d) * r, y: (y / d) * r };
  }
  const hw = Math.max(0, s.w / 2 - margin);
  const hh = Math.max(0, s.h / 2 - margin);
  return { x: Math.max(-hw, Math.min(hw, x)), y: Math.max(-hh, Math.min(hh, y)) };
}

// サドンデスで1回けずったあとの机の形。もうけずれないときは null
export function shrinkShape(shape, sd) {
  if (shape.type === 'circle') {
    const radius = Math.max(sd.minRadius, shape.radius - sd.shrinkPerTurn);
    return radius === shape.radius ? null : { ...shape, radius };
  }
  const w = Math.max(sd.minRect, shape.w - sd.shrinkPerTurn * 2);
  const h = Math.max(sd.minRect, shape.h - sd.shrinkPerTurn * 2);
  return w === shape.w && h === shape.h ? null : { ...shape, w, h };
}

// 点と線分のきょり
export function pointSegDist(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / l2));
  return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t));
}

// 消しゴムの「中心から一番遠いところ」までのおおよその長さ
export function eraserExtent(def) {
  const s = def.shape;
  if (s.type === 'rect') return Math.max(s.w, s.h) / 2;
  return s.radius;
}
