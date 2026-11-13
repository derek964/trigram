/** Foreground depth. A wall fades only where its prism actually covers the hunter. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

export function project(x: number, y: number, scale: number, ox: number, oy: number): Pt {
  return { x: ox + (x - y) * scale * 0.5, y: oy + (x + y) * scale * 0.25 };
}

export function wallDepth(c: number, r: number): number {
  return c + r + 0.5;
}

export function walkerDepth(x: number, y: number): number {
  return x + y;
}

/** Silhouette of the wall prism: top back, top right, base right, base front, base left, top left. */
export function wallSilhouette(c: number, r: number, scale: number, ox: number, oy: number, raise: number): Pt[] {
  const p = (x: number, y: number) => project(x, y, scale, ox, oy);
  const nw = p(c, r);
  const ne = p(c + 1, r);
  const sw = p(c, r + 1);
  const se = p(c + 1, r + 1);
  const up = (q: Pt): Pt => ({ x: q.x, y: q.y - raise });
  return [up(nw), up(ne), ne, se, sw, up(sw)];
}

export function hunterRect(feetX: number, feetY: number, bodyW: number, bodyH: number): Rect {
  return { x: feetX - bodyW / 2, y: feetY - bodyH, w: bodyW, h: bodyH };
}

/** Body plus a strip of floor in front of the feet, so the cut shows contact. */
export function revealRect(feetX: number, feetY: number, bodyW: number, bodyH: number, floorPad: number): Rect {
  const padX = bodyW * 0.28;
  return {
    x: feetX - bodyW / 2 - padX,
    y: feetY - bodyH * 1.04,
    w: bodyW + padX * 2,
    h: bodyH * 1.04 + floorPad,
  };
}

export function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const denom = b.y - a.y || 0.00001;
    const hit = a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / denom + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

function pointInRect(pt: Pt, r: Rect): boolean {
  return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
}

function segHit(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const cross = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function rectHitsPoly(rect: Rect, poly: Pt[]): boolean {
  const corners: Pt[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x, y: rect.y + rect.h },
    { x: rect.x + rect.w, y: rect.y + rect.h },
  ];
  if (corners.some((p) => pointInPoly(p, poly))) return true;
  if (poly.some((p) => pointInRect(p, rect))) return true;
  const edges: [Pt, Pt][] = [
    [corners[0]!, corners[1]!],
    [corners[1]!, corners[3]!],
    [corners[3]!, corners[2]!],
    [corners[2]!, corners[0]!],
  ];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    for (const [c, d] of edges) if (segHit(a, b, c!, d!)) return true;
  }
  return false;
}

/** True when this foreground prism covers the reveal rect. Several walls may. */
export function shouldCutaway(depth: number, playerDepth: number, poly: Pt[], hunter: Rect): boolean {
  return depth > playerDepth + 0.05 && rectHitsPoly(hunter, poly);
}
