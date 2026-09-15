import { cellAt, cellPathFrom, mazeDegree, type Maze } from "./maze";
import { clamp } from "./math";

export type ProxPhase = "key" | "isolation";

export interface Feedback {
  maze: Maze;
  visited: Set<number>;
  /** Ordered cell ids of the walk, including backtracks. Used to stroke one continuous trail. */
  trail: number[];
  hasKey: boolean;
  cellId: number;
  hopsKeyStart: number;
  hopsIsoStart: number;
  lastHops: number;
  lastValue: number;
}

export interface VisitResult {
  closer: boolean;
  farther: boolean;
  deadEnd: boolean;
  value: number;
  hops: number;
  phase: ProxPhase;
}

function hopsFrom(maze: Maze, fromId: number, goal: (id: number) => boolean, locked: boolean): number {
  const path = cellPathFrom(maze, fromId, goal, locked);
  return path ? path.length - 1 : 99;
}

export function keyCellId(maze: Maze): number {
  return maze.keyPos ? cellAt(maze, maze.keyPos) : -1;
}

export function currentPhase(fb: Feedback): ProxPhase {
  return fb.maze.config.needsKey && !fb.hasKey ? "key" : "isolation";
}

export function currentHops(fb: Feedback, cellId = fb.cellId): number {
  const maze = fb.maze;
  if (currentPhase(fb) === "key") {
    const kid = keyCellId(maze);
    return hopsFrom(maze, cellId, (id) => id === kid, true);
  }
  return hopsFrom(maze, cellId, (id) => maze.cells[id]!.courtyard, false);
}

export function proximityValue(fb: Feedback, hops = currentHops(fb)): number {
  if (fb.maze.config.needsKey && !fb.hasKey) {
    return 0.5 * clamp(1 - hops / Math.max(1, fb.hopsKeyStart), 0, 1);
  }
  if (fb.maze.config.needsKey && fb.hasKey) {
    return 0.5 + 0.5 * clamp(1 - hops / Math.max(1, fb.hopsIsoStart), 0, 1);
  }
  return clamp(1 - hops / Math.max(1, fb.hopsIsoStart), 0, 1);
}

export function createFeedback(maze: Maze, hasKey: boolean): Feedback {
  const start = maze.startCell;
  const kid = keyCellId(maze);
  const hopsKeyStart = kid >= 0 ? hopsFrom(maze, start, (id) => id === kid, true) : 1;
  const hopsIsoStart = hopsFrom(maze, start, (id) => maze.cells[id]!.courtyard, false);
  const fb: Feedback = {
    maze,
    visited: new Set<number>(),
    trail: [],
    hasKey,
    cellId: start,
    hopsKeyStart: Math.max(1, hopsKeyStart),
    hopsIsoStart: Math.max(1, hopsIsoStart),
    lastHops: 99,
    lastValue: 0,
  };
  markCell(fb, start);
  return fb;
}

export function setHasKey(fb: Feedback, hasKey: boolean): void {
  if (fb.hasKey === hasKey) return;
  fb.hasKey = hasKey;
  if (hasKey) {
    fb.hopsIsoStart = Math.max(1, currentHops(fb, fb.cellId));
  }
  fb.lastHops = currentHops(fb, fb.cellId);
  fb.lastValue = proximityValue(fb, fb.lastHops);
}

export function isCulDeSac(maze: Maze, cellId: number): boolean {
  const c = maze.cells[cellId];
  if (!c || c.courtyard || cellId === maze.startCell) return false;
  return mazeDegree(maze.cells, c) === 1;
}

export function markCell(fb: Feedback, cellId: number): VisitResult {
  fb.visited.add(cellId);
  if (fb.trail[fb.trail.length - 1] !== cellId) fb.trail.push(cellId);
  const hops = currentHops(fb, cellId);
  const value = proximityValue(fb, hops);
  const closer = hops < fb.lastHops;
  const farther = hops > fb.lastHops;
  const deadEnd = cellId !== fb.cellId && isCulDeSac(fb.maze, cellId);
  fb.cellId = cellId;
  fb.lastHops = hops;
  fb.lastValue = value;
  return { closer, farther, deadEnd, value, hops, phase: currentPhase(fb) };
}

/** Shortest cell path for the active goal (key, then isolation). */
export function feedbackPath(maze: Maze, hasKey: boolean): number[] {
  if (maze.config.needsKey && !hasKey) {
    const kid = keyCellId(maze);
    return cellPathFrom(maze, maze.startCell, (id) => id === kid, true) ?? [maze.startCell];
  }
  return cellPathFrom(maze, maze.startCell, (id) => maze.cells[id]!.courtyard, false) ?? [maze.startCell];
}

export function applyPath(fb: Feedback, ids: number[]): VisitResult[] {
  const out: VisitResult[] = [];
  for (const id of ids) out.push(markCell(fb, id));
  return out;
}
