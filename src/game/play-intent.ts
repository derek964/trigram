import { HOLE_WIDTH } from "./levels";
import { cellAt, nearestPunchableDist, punchHole, type Maze } from "./maze";
import { dist, type Vec2 } from "./math";

/** Same slack `tryTapMove` uses so corridor-center taps stay walkable. */
export const FLOOR_TAP_FRAC = 0.58;

export function repairWallHit(maze: Maze): number {
  return maze.wallHalf + 0.18;
}

export function isFloorCellTap(maze: Maze, world: Vec2, frac = FLOOR_TAP_FRAC): boolean {
  const id = cellAt(maze, world);
  const c = maze.cells[id];
  if (!c) return false;
  return dist(world, c) <= maze.cellSize * frac;
}

export type PlayTapAction = "move" | "repair" | "cancel-move" | "cancel" | "offer-heart" | "noop";

/**
 * Ground taps never spend 检修. Opening a vent requires an armed wall-select
 * mode, then a tap that is actually on a punchable wall — not a corridor center.
 */
export function resolvePlayTap(
  maze: Maze,
  world: Vec2,
  repairMode: boolean,
  hearts: number,
): PlayTapAction {
  const wallD = nearestPunchableDist(maze, world);
  const onWall = Number.isFinite(wallD) && wallD <= repairWallHit(maze);
  const onFloor = isFloorCellTap(maze, world);

  if (repairMode) {
    if (onWall) return hearts > 0 ? "repair" : "offer-heart";
    if (onFloor) return "cancel-move";
    return "cancel";
  }
  if (onFloor) return "move";
  return "noop";
}

/** Spend a charge only after geometry actually opens. */
export function applyRepairTap(maze: Maze, world: Vec2): boolean {
  return punchHole(maze, world, HOLE_WIDTH, repairWallHit(maze));
}
