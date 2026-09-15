import { CHASER_VISION, SPEED } from "./levels";
import { collideMove, inPlayableFloor, rayHitsCover, shortestPath, type Maze } from "./maze";
import { dist, lerp, type Vec2 } from "./math";

export type ChaserMode = "patrol" | "chase" | "lost";

export interface Chaser {
  x: number;
  y: number;
  facing: number;
  mode: ChaserMode;
  lostT: number;
  patrol: Vec2 | null;
  vision: number;
  repath: number;
  waypoint: Vec2 | null;
  rng: () => number;
}

export function makeChaser(maze: Maze, rng: () => number = Math.random): Chaser {
  return {
    x: maze.chaserSpawn.x,
    y: maze.chaserSpawn.y,
    facing: Math.PI / 2,
    mode: "patrol",
    lostT: 0,
    patrol: null,
    vision: CHASER_VISION,
    repath: 0,
    waypoint: null,
    rng,
  };
}

export function hasLos(maze: Maze, ch: Chaser, player: Vec2): boolean {
  const d = dist(ch, player);
  if (d > ch.vision) return false;
  const ang = Math.atan2(player.y - ch.y, player.x - ch.x);
  let da = ang - ch.facing;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  if (Math.abs(da) > 0.72) return false;
  return !rayHitsCover(maze, { x: ch.x, y: ch.y }, player);
}

export function updateChaser(maze: Maze, ch: Chaser, player: Vec2, dt: number): void {
  const see = hasLos(maze, ch, player);
  if (see) {
    ch.mode = "chase";
    ch.lostT = 0;
  } else if (ch.mode === "chase") {
    ch.mode = "lost";
    ch.lostT = 1.35;
  } else if (ch.mode === "lost") {
    ch.lostT -= dt;
    if (ch.lostT <= 0) {
      ch.mode = "patrol";
      ch.patrol = null;
    }
  }

  let target: Vec2 | null = null;
  if (ch.mode === "chase" || ch.mode === "lost") target = player;
  else {
    if (!ch.patrol || dist(ch, ch.patrol) < 0.55) {
      const pool = maze.cells.filter((c) => !c.courtyard);
      const c = pool[Math.floor(ch.rng() * pool.length)] ?? maze.cells[0]!;
      ch.patrol = { x: c.x, y: c.y };
    }
    target = ch.patrol;
  }

  if (!target) return;
  ch.repath -= dt;
  if (ch.repath <= 0) {
    const goal = target;
    const path = shortestPath(maze, { x: ch.x, y: ch.y }, (p) => dist(p, goal) < 0.45, maze.locked);
    ch.waypoint = path && path.points.length > 1 ? path.points[Math.min(3, path.points.length - 1)]! : goal;
    ch.repath = ch.mode === "chase" ? 0.18 : 0.4;
  }
  const aim = ch.waypoint ?? target;
  const dx = aim.x - ch.x;
  const dy = aim.y - ch.y;
  const L = Math.hypot(dx, dy) || 1;
  const step = SPEED * dt;
  const next = collideMove(maze, ch, 0.2, (dx / L) * step, (dy / L) * step, maze.locked);
  if (inPlayableFloor(maze, next)) {
    ch.x = next.x;
    ch.y = next.y;
  }
  if (L > 0.05) ch.facing = lerp(ch.facing, Math.atan2(dy, dx), 0.25);
}
