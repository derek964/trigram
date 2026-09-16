import { HOLE_WIDTH } from "./levels";
import { cellAt, nearestPunchableDist, punchHole, walkableNeighbors, type Maze } from "./maze";
import { dist, type Vec2 } from "./math";

/** Same slack tap-to-step uses so corridor-center taps stay walkable. */
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

export type TapMoveIntent =
  | { kind: "miss" }
  | { kind: "step"; from: number; to: number }
  | { kind: "blocked"; from: number; to: number }
  | { kind: "far"; from: number; to: number };

/**
 * Floor taps never A* a multi-cell route. Only an adjacent walkable cell
 * is a step; a grid neighbor behind a wall (or a locked cage) is blocked;
 * anything farther is ignored.
 */
export function resolveTapMove(maze: Maze, player: Vec2, world: Vec2): TapMoveIntent {
  if (!isFloorCellTap(maze, world)) return { kind: "miss" };
  const to = cellAt(maze, world);
  const from = cellAt(maze, player);
  if (from === to) return { kind: "miss" };
  if (walkableNeighbors(maze, from, maze.locked).includes(to)) {
    return { kind: "step", from, to };
  }
  const here = maze.cells[from];
  if (here && (here.links.has(to) || here.neighbors.includes(to))) {
    return { kind: "blocked", from, to };
  }
  return { kind: "far", from, to };
}
