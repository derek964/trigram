export interface Vec2 {
  x: number;
  y: number;
}

export const SOUTH = Math.PI / 2;

export function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function angNorm(a: number): number {
  let x = a % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x;
}

export function angDelta(a: number, b: number): number {
  let d = angNorm(b) - angNorm(a);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angLerp(a0: number, a1: number): number {
  a0 = angNorm(a0);
  a1 = angNorm(a1);
  if (a1 < a0) a1 += Math.PI * 2;
  return a1 - a0;
}

export function angOverlapRange(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): { th0: number; th1: number } | null {
  const aSpan = angLerp(a0, a1);
  const A0 = angNorm(a0);
  const A1 = A0 + aSpan;
  let B0 = angNorm(b0);
  const bSpan = angLerp(b0, b1);
  let B1 = B0 + bSpan;
  while (B1 < A0) {
    B0 += Math.PI * 2;
    B1 += Math.PI * 2;
  }
  while (B0 > A1) {
    B0 -= Math.PI * 2;
    B1 -= Math.PI * 2;
  }
  const lo = Math.max(A0, B0);
  const hi = Math.min(A1, B1);
  if (hi - lo <= 1e-6) return null;
  return { th0: lo, th1: hi };
}

export function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): number {
  const range = angOverlapRange(a0, a1, b0, b1);
  return range ? range.th1 - range.th0 : 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function keyPoint(p: Vec2, digits = 3): string {
  return `${p.x.toFixed(digits)},${p.y.toFixed(digits)}`;
}

export function polar(r: number, angle: number): Vec2 {
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

/** Tessellate a circular arc into a polyline with ~maxChord world spacing. */
export function arcPoly(r: number, th0: number, th1: number, maxChord = 0.28): Vec2[] {
  const span = angLerp(th0, th1);
  const start = angNorm(th0);
  const n = Math.max(2, Math.ceil((r * span) / Math.max(0.12, maxChord)));
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) pts.push(polar(r, start + (span * i) / n));
  return pts;
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): { dist: number; nx: number; ny: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-9 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  const qx = a.x + dx * t;
  const qy = a.y + dy * t;
  const ex = p.x - qx;
  const ey = p.y - qy;
  const d = Math.hypot(ex, ey);
  if (d < 1e-8) {
    const nl = Math.hypot(dx, dy) || 1;
    return { dist: 0, nx: -dy / nl, ny: dx / nl, t };
  }
  return { dist: d, nx: ex / d, ny: ey / d, t };
}
