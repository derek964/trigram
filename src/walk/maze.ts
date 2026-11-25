/** One small branching maze. `#` wall, `.` floor, `S` start, `G` flag. */
export const MAZE_ROWS = [
  "###########",
  "#S..#.....#",
  "#.#.#.###.#",
  "#.#...#...#",
  "#.###.#.#.#",
  "#...#.#.#.#",
  "###.#...#.#",
  "#...###.#.#",
  "#.#.....#.#",
  "#.#####.#G#",
  "###########",
] as const;

export const PLAYER_RADIUS = 0.22;
export const GOAL_RADIUS = 0.46;

export type Grid = number[][];

export interface CellPoint {
  c: number;
  r: number;
  x: number;
  y: number;
}

function findChar(ch: string): CellPoint {
  for (let r = 0; r < MAZE_ROWS.length; r++) {
    const c = MAZE_ROWS[r]!.indexOf(ch);
    if (c >= 0) return { c, r, x: c + 0.5, y: r + 0.5 };
  }
  throw new Error(`maze missing ${ch}`);
}

export const MAZE_GRID: Grid = MAZE_ROWS.map((row) => [...row].map((ch) => (ch === "#" ? 1 : 0)));
export const START = findChar("S");
export const GOAL = findChar("G");

export function isOpen(grid: Grid, c: number, r: number): boolean {
  if (r < 0 || c < 0 || r >= grid.length || c >= (grid[0]?.length ?? 0)) return false;
  return grid[r]![c] === 0;
}

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function openNeighborCount(c: number, r: number, grid: Grid = MAZE_GRID): number {
  let n = 0;
  for (const [dx, dy] of DIRS) if (isOpen(grid, c + dx, r + dy)) n++;
  return n;
}

export function deadEnds(grid: Grid = MAZE_GRID): CellPoint[] {
  const out: CellPoint[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 0; c < row.length; c++) {
      if (!isOpen(grid, c, r) || openNeighborCount(c, r, grid) !== 1) continue;
      out.push({ c, r, x: c + 0.5, y: r + 0.5 });
    }
  }
  return out;
}

export function junctions(grid: Grid = MAZE_GRID): CellPoint[] {
  const out: CellPoint[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 0; c < row.length; c++) {
      if (!isOpen(grid, c, r) || openNeighborCount(c, r, grid) < 3) continue;
      out.push({ c, r, x: c + 0.5, y: r + 0.5 });
    }
  }
  return out;
}

/** Orthogonal floor path from start cell to the flag. Null when walled off. */
export function shortestPath(grid: Grid = MAZE_GRID): { x: number; y: number }[] | null {
  const start = { x: START.x, y: START.y };
  const goal = { x: GOAL.x, y: GOAL.y };
  const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
  const q = [start];
  const prev = new Map<string, string>();
  const seen = new Set([key(start)]);
  let found = false;
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    if (p.x === goal.x && p.y === goal.y) {
      found = true;
      break;
    }
    const c = Math.floor(p.x);
    const r = Math.floor(p.y);
    for (const [dx, dy] of DIRS) {
      const nc = c + dx;
      const nr = r + dy;
      if (!isOpen(grid, nc, nr)) continue;
      const np = { x: nc + 0.5, y: nr + 0.5 };
      const k = key(np);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, key(p));
      q.push(np);
    }
  }
  if (!found) return null;
  const path = [goal];
  let k = key(goal);
  const sk = key(start);
  while (k !== sk) {
    const pk = prev.get(k);
    if (!pk) return null;
    const [xs, ys] = pk.split(",");
    path.push({ x: Number(xs), y: Number(ys) });
    k = pk;
  }
  path.reverse();
  return path;
}
