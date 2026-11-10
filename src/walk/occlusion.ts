/** Depth and overlap for tall walls. Only a wall in front of the hunter, and covering the sprite, is faded. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function project(x: number, y: number, scale: number, ox: number, oy: number): { x: number; y: number } {
  return { x: ox + (x - y) * scale * 0.5, y: oy + (x + y) * scale * 0.25 };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function wallDepth(c: number, r: number): number {
  return c + r + 0.5;
}

export function walkerDepth(x: number, y: number): number {
  return x + y;
}

/** Screen box of a wall prism, including the raised top. */
export function wallRect(c: number, r: number, scale: number, ox: number, oy: number, raise: number): Rect {
  const pts = [
    project(c, r, scale, ox, oy),
    project(c + 1, r, scale, ox, oy),
    project(c, r + 1, scale, ox, oy),
    project(c + 1, r + 1, scale, ox, oy),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y - raise);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function hunterRect(feetX: number, feetY: number, bodyW: number, bodyH: number): Rect {
  return { x: feetX - bodyW / 2, y: feetY - bodyH, w: bodyW, h: bodyH };
}

/** Fade this cell only. Walls behind the hunter, and front walls that miss the sprite, stay solid. */
export function shouldCutaway(
  depth: number,
  playerDepth: number,
  wall: Rect,
  hunter: Rect,
  near: boolean,
): boolean {
  return near && depth > playerDepth + 0.05 && rectsOverlap(wall, hunter);
}
