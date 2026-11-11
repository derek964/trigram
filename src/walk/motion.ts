import { GOAL, GOAL_RADIUS, MAZE_GRID, PLAYER_RADIUS, START, type Grid } from "./maze";

export const MOVE_SPEED = 2.55;
/**
 * North, south, and west plants share the measured same-foot step of 0.256,
 * so four holds are 1.024. That number is the sheet measurement, not the east
 * plant. East plants use 0.440 and do not read this. Planted boots lock to a
 * world sole. A stop keeps that latch.
 */
export const WALK_CYCLE_DISTANCE = 1.024;
/** Measured V6 same-foot step on the north, south, and west sheets. Not 0.440. */
export const NSW_MEASURED_STEP = 0.256;
/** Windows of one 0.256 plant. Not slices of the 1.024 cycle. */
export const NSW_ENTRY_END = 0.064;
export const NSW_MID_END = 0.192;

export function nswPoseWindow(local: number): "entry" | "mid" | "trail" {
  if (local < NSW_ENTRY_END) return "entry";
  if (local < NSW_MID_END) return "mid";
  return "trail";
}

/** Entry, the 0.064 and 0.192 edges, local 0.128, and the trailing end. */
export function samplePlantLocal(local: number, distance: number): boolean {
  if (local < 0.06) return true;
  if (local > distance - 0.05) return true;
  if (Math.abs(local - NSW_ENTRY_END) < 0.02) return true;
  if (Math.abs(local - 0.128) < 0.02) return true;
  if (Math.abs(local - NSW_MID_END) < 0.02) return true;
  return false;
}
export const WALK_PHASE_PER_UNIT = (Math.PI * 2) / WALK_CYCLE_DISTANCE;

export interface Walker {
  x: number;
  y: number;
  /** Radians. 0 = east, +π/2 = south. Follows the last actual displacement. */
  facing: number;
  /** Kept so west still reports a side. The drawn facing is the cardinal of `facing`. */
  flip: boolean;
  phase: number;
  moving: boolean;
  won: boolean;
}

export interface Stick {
  x: number;
  y: number;
}

export function createWalker(): Walker {
  return { x: START.x, y: START.y, facing: 0, flip: false, phase: 0, moving: false, won: false };
}

export function isWall(grid: Grid, c: number, r: number): boolean {
  if (r < 0 || c < 0 || r >= grid.length || c >= (grid[0]?.length ?? 0)) return true;
  return grid[r]![c] === 1;
}

export function circleBlocked(grid: Grid, x: number, y: number, radius: number): boolean {
  const minC = Math.floor(x - radius);
  const maxC = Math.floor(x + radius);
  const minR = Math.floor(y - radius);
  const maxR = Math.floor(y + radius);
  const limit = radius * radius - 1e-8;
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!isWall(grid, c, r)) continue;
      const qx = Math.min(Math.max(x, c), c + 1);
      const qy = Math.min(Math.max(y, r), r + 1);
      const dx = x - qx;
      const dy = y - qy;
      if (dx * dx + dy * dy < limit) return true;
    }
  }
  return false;
}

/** Axis-separated slide. Substeps stay under the radius so a long move cannot tunnel. */
export function moveCircle(
  grid: Grid,
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x, y };
  const maxStep = Math.max(0.02, radius * 0.45);
  const n = Math.max(1, Math.ceil(dist / maxStep));
  const sx = dx / n;
  const sy = dy / n;
  let cx = x;
  let cy = y;
  for (let i = 0; i < n; i++) {
    if (!circleBlocked(grid, cx + sx, cy, radius)) cx += sx;
    if (!circleBlocked(grid, cx, cy + sy, radius)) cy += sy;
  }
  return { x: cx, y: cy };
}

export function poseFromDelta(
  dx: number,
  dy: number,
  prevFlip: boolean,
): { facing: number; flip: boolean } | null {
  if (Math.hypot(dx, dy) < 1e-6) return null;
  let flip = prevFlip;
  if (dx < -1e-5) flip = true;
  else if (dx > 1e-5) flip = false;
  return { facing: Math.atan2(dy, dx), flip };
}

export function stepWalker(w: Walker, stick: Stick, dt: number, grid: Grid = MAZE_GRID): Walker {
  if (w.won) return { ...w, moving: false };
  const stepDt = Math.min(Math.max(dt, 0), 0.05);
  let ix = stick.x;
  let iy = stick.y;
  const mag = Math.hypot(ix, iy);
  if (mag > 1) {
    ix /= mag;
    iy /= mag;
  }
  const next = moveCircle(grid, w.x, w.y, ix * MOVE_SPEED * stepDt, iy * MOVE_SPEED * stepDt, PLAYER_RADIUS);
  const mx = next.x - w.x;
  const my = next.y - w.y;
  const moved = Math.hypot(mx, my);
  const pose = poseFromDelta(mx, my, w.flip);
  const won = Math.hypot(next.x - GOAL.x, next.y - GOAL.y) <= GOAL_RADIUS;
  return {
    x: next.x,
    y: next.y,
    facing: pose ? pose.facing : w.facing,
    flip: pose ? pose.flip : w.flip,
    phase: w.phase + (moved > 1e-4 ? moved * WALK_PHASE_PER_UNIT : 0),
    moving: moved > 1e-4,
    won: w.won || won,
  };
}
