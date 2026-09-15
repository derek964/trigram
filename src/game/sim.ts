import { CATCH_RANGE, LEVELS, SPEED, type LevelConfig } from "./levels";
import { hasLos, makeChaser, updateChaser, type Chaser } from "./chaser";
import {
  cellAt,
  cellPathToCenter,
  collideMove,
  coveredLosCells,
  generateMaze,
  inCenter,
  inPlayableFloor,
  openLosCells,
  rayHitsCover,
  rayHitsGrass,
  rayHitsWall,
  shortestPath,
  walkableNeighbors,
  type Maze,
} from "./maze";
import { dist, mulberry32, type Vec2 } from "./math";

export interface LevelSim {
  id: number;
  pattern: string;
  title: string;
  optOk: boolean;
  optSteps: number;
  greedyOk: boolean;
  greedySteps: number;
  nExtra: number;
  deaths: number;
  catchOk: boolean | null;
  grassOk: boolean | null;
  note: string;
}

export interface CampaignSim {
  levels: LevelSim[];
  optimalClears: number;
  greedyClears: number;
  greedyDeaths: number;
  catchPass: number;
  grassPass: number;
  thiefLevels: number;
}

function pathLen(pts: Vec2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1]!, pts[i]!);
  return s;
}

function optimalDistance(maze: Maze): number | null {
  maze.locked = maze.config.needsKey;
  if (maze.config.needsKey && maze.keyPos) {
    const key = maze.keyPos;
    const toKey = shortestPath(maze, maze.start, (p) => dist(p, key) < 0.55, true);
    if (!toKey) return null;
    maze.locked = false;
    const toIso = shortestPath(maze, key, maze.hedge - 0.2, false);
    if (!toIso) return null;
    return pathLen(toKey.points) + pathLen(toIso.points);
  }
  maze.locked = false;
  const p = shortestPath(maze, maze.start, maze.hedge - 0.2, false);
  return p ? pathLen(p.points) : null;
}

function scoreCenter(maze: Maze, id: number): number {
  const c = maze.cells[id]!;
  return Math.hypot(c.x, c.y);
}

function greedyIds(maze: Maze, fromId: number, goal: (id: number) => boolean, locked: boolean, score: (id: number) => number): number[] | null {
  const stack = [fromId];
  const visited = new Set<number>([fromId]);
  const walk: number[] = [fromId];
  let guard = 0;
  while (stack.length && guard++ < 2000) {
    const cur = stack[stack.length - 1]!;
    if (goal(cur)) return walk;
    const kids = walkableNeighbors(maze, cur, locked).slice().sort((a, b) => score(a) - score(b));
    const nxt = kids.find((k) => !visited.has(k));
    if (nxt !== undefined) {
      visited.add(nxt);
      stack.push(nxt);
      walk.push(nxt);
    } else {
      stack.pop();
      if (stack.length) walk.push(stack[stack.length - 1]!);
    }
  }
  return goal(walk[walk.length - 1]!) ? walk : null;
}

function greedyRoute(maze: Maze): number[] | null {
  const start = maze.startCell;
  const atIso = (id: number) => maze.cells[id]!.courtyard;
  if (!maze.config.needsKey) {
    return greedyIds(maze, start, atIso, false, (id) => scoreCenter(maze, id));
  }
  const keyId = maze.keyPos ? cellAt(maze, maze.keyPos) : -1;
  const atKey = (id: number) => keyId >= 0 && id === keyId;
  const towardKey = greedyIds(maze, start, atKey, true, (id) => {
    const c = maze.cells[id]!;
    return maze.keyPos ? dist(c, maze.keyPos) : scoreCenter(maze, id);
  });
  if (towardKey) {
    const rest = greedyIds(maze, keyId, atIso, false, (id) => scoreCenter(maze, id));
    if (!rest) return null;
    return towardKey.concat(rest.slice(1));
  }
  const wander = greedyIds(maze, start, atIso, true, (id) => scoreCenter(maze, id)) ?? [start];
  const fromHere = wander[wander.length - 1]!;
  const toKey = greedyIds(maze, fromHere, atKey, true, (id) => {
    const c = maze.cells[id]!;
    return maze.keyPos ? dist(c, maze.keyPos) : scoreCenter(maze, id);
  });
  if (!toKey) return null;
  const rest = greedyIds(maze, keyId, atIso, false, (id) => scoreCenter(maze, id));
  if (!rest) return null;
  return wander.concat(toKey.slice(1)).concat(rest.slice(1));
}

interface WalkResult {
  ok: boolean;
  steps: number;
  deaths: number;
  dist: number;
}

function walkRoute(maze: Maze, ids: number[], withThief: boolean, rng: () => number): WalkResult {
  const ch: Chaser | null = withThief && maze.config.hasChaser ? makeChaser(maze, rng) : null;
  let pos: Vec2 = { ...maze.start };
  let distWalked = 0;
  let deaths = 0;
  let hasKey = !maze.config.needsKey;
  maze.locked = maze.config.needsKey;
  const dt = 1 / 24;
  const step = SPEED * dt;
  let ticks = 0;
  const maxTicks = 12000;
  let i = 0;
  while (i < ids.length && ticks < maxTicks) {
    const target = maze.cells[ids[i]!]!;
    const goal = { x: target.x, y: target.y };
    while (dist(pos, goal) > 0.22 && ticks < maxTicks) {
      ticks += 1;
      const dx = goal.x - pos.x;
      const dy = goal.y - pos.y;
      const L = Math.hypot(dx, dy) || 1;
      const want = collideMove(maze, pos, 0.2, (dx / L) * step, (dy / L) * step, maze.locked);
      const next = inPlayableFloor(maze, want) ? want : pos;
      distWalked += dist(pos, next);
      pos = next;
      if (maze.keyPos && !hasKey && dist(pos, maze.keyPos) < 0.5) {
        hasKey = true;
        maze.locked = false;
      }
      if (inCenter(pos, maze.hedge - 0.08) && hasKey) {
        return { ok: true, steps: Math.max(1, Math.round(distWalked)), deaths, dist: distWalked };
      }
      if (ch) {
        updateChaser(maze, ch, pos, dt);
        if (dist(ch, pos) < CATCH_RANGE) {
          deaths += 1;
          return { ok: false, steps: Math.max(1, Math.round(distWalked)), deaths, dist: distWalked };
        }
      }
    }
    i += 1;
  }
  const ok = inCenter(pos, maze.hedge - 0.08) && hasKey;
  return { ok, steps: Math.max(1, Math.round(distWalked)), deaths, dist: distWalked };
}

export function simulateCatch(maze: Maze, rng: () => number): boolean {
  const spots = openLosCells(maze);
  if (!spots.length) return false;
  const spot = spots.reduce((a, b) => (dist(maze.chaserSpawn, b) > dist(maze.chaserSpawn, a) ? b : a));
  const player = { x: spot.x, y: spot.y };
  const ch = makeChaser(maze, rng);
  ch.facing = Math.atan2(player.y - ch.y, player.x - ch.x);
  if (!hasLos(maze, ch, player)) return false;
  maze.locked = false;
  const path = shortestPath(maze, { x: ch.x, y: ch.y }, (p) => dist(p, player) < 0.4, false);
  if (!path) return false;
  const dt = 1 / 24;
  const step = SPEED * dt;
  let i = 1;
  for (let t = 0; t < 2400 && i < path.points.length; t++) {
    const goal = path.points[i]!;
    const dx = goal.x - ch.x;
    const dy = goal.y - ch.y;
    const L = Math.hypot(dx, dy) || 1;
    const next = collideMove(maze, ch, 0.2, (dx / L) * step, (dy / L) * step, false);
    if (inPlayableFloor(maze, next)) {
      ch.x = next.x;
      ch.y = next.y;
    }
    if (dist(ch, goal) < 0.2) i += 1;
    if (dist(ch, player) < CATCH_RANGE) return true;
  }
  return dist(ch, player) < CATCH_RANGE + 0.05;
}

export function simulateGrassLos(maze: Maze): boolean {
  if (!maze.grass.length) return false;
  const covered = coveredLosCells(maze);
  const open = openLosCells(maze);
  if (!covered.length || !open.length) return false;
  const c = covered[0]!;
  const o = open[0]!;
  const from = maze.chaserSpawn;
  return (
    !rayHitsWall(maze, from, { x: c.x, y: c.y }) &&
    rayHitsGrass(maze, from, { x: c.x, y: c.y }) &&
    rayHitsCover(maze, from, { x: c.x, y: c.y }) &&
    !rayHitsCover(maze, from, { x: o.x, y: o.y })
  );
}

export function simulateLevel(cfg: LevelConfig): LevelSim {
  const maze = generateMaze(cfg);
  const rng = mulberry32(cfg.seed + 91);
  const optDist = optimalDistance(maze);
  const optOk = optDist !== null && optDist > 0;
  const optSteps = optOk ? Math.max(1, Math.round(optDist)) : 0;

  const route = greedyRoute(maze);
  let greedy: WalkResult = { ok: false, steps: 0, deaths: 0, dist: 0 };
  if (route && route.length) {
    greedy = walkRoute(maze, route, cfg.hasChaser, rng);
  }

  let catchOk: boolean | null = null;
  let grassOk: boolean | null = null;
  if (cfg.hasChaser) {
    catchOk = simulateCatch(generateMaze(cfg), mulberry32(cfg.seed + 7));
    grassOk = simulateGrassLos(generateMaze(cfg));
  }

  const nExtra = Math.round((greedy.dist || greedy.steps) - (optDist ?? 0));
  const note = !optOk
    ? "optimal miss"
    : cfg.hasChaser && !catchOk
      ? "thief cannot catch"
      : cfg.hasChaser && !grassOk
        ? "隐藏草 does not break LOS"
        : greedy.deaths
          ? "greedy caught by 偷宠贼"
          : greedy.ok
            ? ""
            : "greedy unfinished";

  return {
    id: cfg.id,
    pattern: cfg.pattern,
    title: cfg.title,
    optOk,
    optSteps,
    greedyOk: greedy.ok,
    greedySteps: greedy.steps,
    nExtra,
    deaths: greedy.deaths,
    catchOk,
    grassOk,
    note,
  };
}

export function runCampaignSim(): CampaignSim {
  const levels = LEVELS.map((cfg) => simulateLevel(cfg));
  const thief = levels.filter((l) => l.catchOk !== null);
  return {
    levels,
    optimalClears: levels.filter((l) => l.optOk).length,
    greedyClears: levels.filter((l) => l.greedyOk).length,
    greedyDeaths: levels.reduce((n, l) => n + l.deaths, 0),
    catchPass: thief.filter((l) => l.catchOk).length,
    grassPass: thief.filter((l) => l.grassOk).length,
    thiefLevels: thief.length,
  };
}

export function formatSimReport(sim: CampaignSim): string {
  const lines: string[] = [
    "# Sim report — 拯救小动物",
    "",
    `Generated by \`npm run sim:levels\` (headless, no browser).`,
    "",
    "## Summary",
    "",
    `- Optimal shortest-path agent: **${sim.optimalClears}/30** clears (key order on L11–30).`,
    `- Greedy-human (center bias): **${sim.greedyClears}/30** clears, **${sim.greedyDeaths}** deaths.`,
    `- 偷宠贼 catch tests: **${sim.catchPass}/${sim.thiefLevels}**.`,
    `- 隐藏草 LOS break: **${sim.grassPass}/${sim.thiefLevels}**.`,
    "",
    "## Per level",
    "",
    "| L | pattern | opt | opt steps | greedy | greedy steps | n_extra | deaths | catch | grass | note |",
    "| --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- | --- |",
  ];
  for (const l of sim.levels) {
    const yn = (v: boolean | null) => (v === null ? "—" : v ? "ok" : "FAIL");
    lines.push(
      `| ${l.id} | ${l.pattern} | ${yn(l.optOk)} | ${l.optSteps} | ${yn(l.greedyOk)} | ${l.greedySteps} | ${l.nExtra} | ${l.deaths} | ${yn(l.catchOk)} | ${yn(l.grassOk)} | ${l.note} |`,
    );
  }
  lines.push("", "Optimal `ok` is the CI gate for this command. Greedy deaths on 防盗夜 are expected.");
  lines.push("");
  return lines.join("\n");
}

export function simCommandOk(sim: CampaignSim): boolean {
  if (sim.optimalClears < 30) return false;
  if (sim.thiefLevels !== 10) return false;
  if (sim.catchPass < sim.thiefLevels) return false;
  if (sim.grassPass < sim.thiefLevels) return false;
  return true;
}

/** Used by unit tests — keep cellPathToCenter referenced so tree-shaking does not drop the import in tests. */
export function isolationReachable(maze: Maze): boolean {
  return cellPathToCenter(maze) !== null;
}
