import {
  CHASER_VISION,
  HOLE_WIDTH,
  MIN_CORRIDOR,
  PLAYER_RADIUS,
  minCellHops,
  minGeoSteps,
  type LevelConfig,
} from "./levels";
import { type Vec2, angLerp, angNorm, clamp, dist, distToSegment, mulberry32, polar, shuffle } from "./math";

export interface Cell {
  id: number;
  gx: number;
  gy: number;
  x: number;
  y: number;
  neighbors: number[];
  links: Set<number>;
  courtyard: boolean;
}

export type Stroke =
  | { kind: "arc"; r: number; th0: number; th1: number }
  | { kind: "radial"; th: number; ri: number; ro: number }
  | { kind: "seg"; a: Vec2; b: Vec2 };

export interface Grass {
  x: number;
  y: number;
  r: number;
}

export interface Maze {
  cells: Cell[];
  strokes: Stroke[];
  segments: { a: Vec2; b: Vec2 }[];
  start: Vec2;
  keyPos: Vec2 | null;
  chaserSpawn: Vec2;
  grass: Grass[];
  cage: number;
  hedge: number;
  outerR: number;
  wallHalf: number;
  approach: { x0: number; x1: number; y0: number; y1: number };
  cageDoor: { a: Vec2; b: Vec2 };
  mouth: { mazeId: number; courtId: number };
  config: LevelConfig;
  locked: boolean;
  startCell: number;
  cellSize: number;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function generateMaze(cfg: LevelConfig): Maze {
  let last: Error | null = null;
  for (let attempt = 0; attempt < 900; attempt++) {
    try {
      return buildOnce(cfg, cfg.seed + attempt * 9973);
    } catch (err) {
      last = err as Error;
    }
  }
  throw last ?? new Error("maze failed");
}

function buildOnce(cfg: LevelConfig, seed: number): Maze {
  const rng = mulberry32(seed);
  const n = cfg.gridN;
  const cellSize = Math.max(cfg.wallWidth + MIN_CORRIDOR + 0.08, cfg.cellSize);
  const origin = (n - 1) / 2;
  const courtCheb = 1;
  const hedge = (courtCheb + 0.5) * cellSize - 0.06;
  const cage = Math.min(0.82, hedge * 0.44);
  const outerR = n * cellSize * 0.5;
  const wallHalf = cfg.wallWidth * 0.5;
  const cells: Cell[] = [];
  const at = new Map<string, number>();

  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const x = (gx - origin) * cellSize;
      const y = (gy - origin) * cellSize;
      const courtyard = Math.max(Math.abs(gx - origin), Math.abs(gy - origin)) <= courtCheb;
      const id = cells.length;
      cells.push({ id, gx, gy, x, y, neighbors: [], links: new Set(), courtyard });
      at.set(`${gx}:${gy}`, id);
    }
  }

  const lookup = (gx: number, gy: number) => at.get(`${gx}:${gy}`);
  for (const c of cells) {
    for (const [dx, dy] of DIRS) {
      const nid = lookup(c.gx + dx, c.gy + dy);
      if (nid === undefined) continue;
      if (!c.neighbors.includes(nid)) c.neighbors.push(nid);
    }
  }

  const mazeCells = cells.filter((c) => !c.courtyard);
  const courtCells = cells.filter((c) => c.courtyard);
  if (!mazeCells.length || !courtCells.length) throw new Error("grid empty");

  for (const a of courtCells) {
    for (const n of a.neighbors) {
      if (cells[n]!.courtyard) {
        a.links.add(n);
        cells[n]!.links.add(a.id);
      }
    }
  }

  const startCell = pickStart(mazeCells);
  carve(cells, startCell, rng);
  sealSouthShaft(cells, startCell);
  restoreAfterSeal(cells, startCell);
  const mouth = openOneMouth(cells, startCell, rng, cfg.preferEwMouth);
  let usedMouth = mouth;
  if (!cellBfs(cells, startCell.id, (id) => cells[id]!.courtyard)) {
    unlinkMouth(cells, mouth);
    const again = reconnectToCourt(cells, startCell);
    if (!again) throw new Error("cannot attach chamber");
    usedMouth = again;
  }
  if (courtMouthCount(cells) !== 1) throw new Error("chamber must have exactly one mouth");
  braidWithoutShortening(cells, startCell.id, cfg.braid, minCellHops(cfg), rng);
  pruneHairlineStubs(cells, startCell);
  if (cfg.pattern === "A") trimLongDeadEnds(cells, startCell, 2);

  const strokes = extractWalls(cells, cellSize, cfg, startCell);
  const segments = tessellate(strokes);
  const gateW = cellSize * 0.42;
  const approach = {
    x0: startCell.x - gateW,
    x1: startCell.x + gateW,
    y0: outerR - 0.08,
    y1: outerR + 0.08,
  };
  const mCell = cells[usedMouth.mazeId]!;
  const cCell = cells[usedMouth.courtId]!;
  const dx = Math.sign(mCell.gx - cCell.gx);
  const dy = Math.sign(mCell.gy - cCell.gy);
  const doorW = cage * 0.42;
  const cageDoor =
    dx !== 0
      ? { a: { x: dx * cage, y: -doorW }, b: { x: dx * cage, y: doorW } }
      : { a: { x: -doorW, y: dy * cage }, b: { x: doorW, y: dy * cage } };
  const maze: Maze = {
    cells,
    strokes,
    segments,
    start: { x: startCell.x, y: startCell.y },
    keyPos: null,
    chaserSpawn: { x: 0, y: 0 },
    cage,
    hedge,
    outerR,
    wallHalf,
    approach,
    cageDoor,
    mouth: usedMouth,
    config: cfg,
    locked: cfg.needsKey,
    startCell: startCell.id,
    cellSize,
    grass: [],
  };

  assertWinding(maze);
  if (cfg.needsKey) {
    maze.keyPos = placeKey(maze, rng, startCell.id);
    if (!maze.keyPos) throw new Error("no key");
    if (!shortestPath(maze, maze.start, (p) => dist(p, maze.keyPos!) < 0.55)) throw new Error("key blocked");
    if (cfg.pattern === "E" && !keyOppositeDoor(maze)) throw new Error("key not opposite door");
  }
  maze.chaserSpawn = placeChaser(maze, rng);
  if (cfg.hasChaser && dist(maze.chaserSpawn, maze.start) < maze.outerR * 0.55) throw new Error("chaser close");
  if (cfg.hasChaser) {
    maze.grass = placeGrass(maze, rng);
    if (!openLosCells(maze).length) throw new Error("no open thief LOS");
    if (!coveredLosCells(maze).length) throw new Error("grass does not break LOS");
  }
  return maze;
}

function pickStart(mazeCells: Cell[]): Cell {
  let best = mazeCells[0]!;
  for (const c of mazeCells) {
    if (c.y > best.y + 1e-6 || (Math.abs(c.y - best.y) < 1e-6 && Math.abs(c.x) < Math.abs(best.x))) best = c;
  }
  return best;
}

function carve(cells: Cell[], start: Cell, rng: () => number): void {
  const stack = [start.id];
  const seen = new Set<number>([start.id]);
  while (stack.length) {
    const id = stack[stack.length - 1]!;
    const c = cells[id]!;
    const opts = c.neighbors.filter((n) => !seen.has(n) && !cells[n]!.courtyard);
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const n = opts[Math.floor(rng() * opts.length)]!;
    c.links.add(n);
    cells[n]!.links.add(id);
    seen.add(n);
    stack.push(n);
  }
  for (const c of cells) {
    if (c.courtyard || seen.has(c.id)) continue;
    const open = c.neighbors.find((n) => seen.has(n) && !cells[n]!.courtyard);
    if (open !== undefined) {
      c.links.add(open);
      cells[open]!.links.add(c.id);
      seen.add(c.id);
    }
  }
}

function sealSouthShaft(cells: Cell[], start: Cell): void {
  for (const c of cells) {
    if (c.courtyard) continue;
    if (c.gx !== start.gx) continue;
    if (c.y >= start.y - 1e-6) continue;
    for (const n of [...c.links]) {
      if (n < 0) continue;
      const o = cells[n]!;
      if (o.courtyard) continue;
      if (o.gx === c.gx && o.gy !== c.gy) {
        c.links.delete(n);
        o.links.delete(c.id);
      }
    }
  }
}

function restoreAfterSeal(cells: Cell[], start: Cell): void {
  const mazeIds = cells.filter((c) => !c.courtyard).map((c) => c.id);
  for (let guard = 0; guard < mazeIds.length + 4; guard++) {
    const reached = floodMaze(cells, start.id);
    const missing = mazeIds.filter((id) => !reached.has(id));
    if (!missing.length) return;
    let linked = false;
    for (const id of missing) {
      const c = cells[id]!;
      const ew = c.neighbors.filter((n) => !cells[n]!.courtyard && reached.has(n) && cells[n]!.gy === c.gy);
      const any = c.neighbors.filter((n) => !cells[n]!.courtyard && reached.has(n) && !(c.gx === start.gx && cells[n]!.gx === start.gx));
      const pick = ew[0] ?? any[0];
      if (pick === undefined) continue;
      c.links.add(pick);
      cells[pick]!.links.add(c.id);
      linked = true;
      break;
    }
    if (!linked) return;
  }
}

function floodMaze(cells: Cell[], from: number): Set<number> {
  const seen = new Set<number>([from]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    for (const n of cells[q[i]!]!.links) {
      if (n < 0 || seen.has(n) || cells[n]!.courtyard) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen;
}

function openOneMouth(
  cells: Cell[],
  start: Cell,
  rng: () => number,
  preferEw: boolean,
): { mazeId: number; courtId: number } {
  const cands: { maze: Cell; court: Cell }[] = [];
  for (const m of cells) {
    if (m.courtyard) continue;
    for (const n of m.neighbors) {
      const o = cells[n]!;
      if (!o.courtyard) continue;
      if (m.gy > o.gy) continue; // never the south wall of the isolation room
      cands.push({ maze: m, court: o });
    }
  }
  if (!cands.length) throw new Error("no chamber mouth");
  shuffle(cands, rng);
  const ew = cands.filter((g) => g.maze.gy === g.court.gy);
  const offCol = (preferEw && ew.length ? ew : cands).filter((g) => g.maze.gx !== start.gx);
  const g = (offCol[0] ?? (preferEw ? ew[0] : undefined) ?? cands[0])!;
  g.maze.links.add(g.court.id);
  g.court.links.add(g.maze.id);
  return { mazeId: g.maze.id, courtId: g.court.id };
}

function reconnectToCourt(cells: Cell[], start: Cell): { mazeId: number; courtId: number } | null {
  if (courtMouthCount(cells) >= 1) return null;
  const reached = floodMaze(cells, start.id);
  const cands: { maze: Cell; court: Cell }[] = [];
  for (const m of cells) {
    if (m.courtyard || !reached.has(m.id)) continue;
    for (const n of m.neighbors) {
      const o = cells[n]!;
      if (!o.courtyard) continue;
      if (m.gy > o.gy) continue;
      cands.push({ maze: m, court: o });
    }
  }
  const g = cands.find((x) => x.maze.gx !== start.gx) ?? cands[0];
  if (!g) return null;
  g.maze.links.add(g.court.id);
  g.court.links.add(g.maze.id);
  return { mazeId: g.maze.id, courtId: g.court.id };
}

function unlinkMouth(cells: Cell[], mouth: { mazeId: number; courtId: number }): void {
  cells[mouth.mazeId]!.links.delete(mouth.courtId);
  cells[mouth.courtId]!.links.delete(mouth.mazeId);
}

function courtMouthCount(cells: Cell[]): number {
  let n = 0;
  for (const c of cells) {
    if (!c.courtyard) continue;
    for (const id of c.links) {
      if (id >= 0 && !cells[id]!.courtyard) n += 1;
    }
  }
  return n;
}

export function courtMouths(maze: Maze): { mazeId: number; courtId: number }[] {
  const out: { mazeId: number; courtId: number }[] = [];
  for (const c of maze.cells) {
    if (!c.courtyard) continue;
    for (const id of c.links) {
      if (id >= 0 && !maze.cells[id]!.courtyard) out.push({ mazeId: id, courtId: c.id });
    }
  }
  return out;
}

function braidWithoutShortening(
  cells: Cell[],
  startId: number,
  braid: number,
  minHops: number,
  rng: () => number,
): void {
  if (braid <= 0) return;
  const mazeCells = cells.filter((c) => !c.courtyard);
  for (const c of mazeCells) {
    for (const n of c.neighbors) {
      if (n < c.id) continue;
      if (cells[n]!.courtyard) continue;
      if (c.links.has(n)) continue;
      if (rng() >= braid) continue;
      c.links.add(n);
      cells[n]!.links.add(c.id);
      const path = cellBfs(cells, startId, (id) => cells[id]!.courtyard);
      if (!path || path.length - 1 < minHops) {
        c.links.delete(n);
        cells[n]!.links.delete(c.id);
      }
    }
  }
}

export function mazeDegree(cells: Cell[], c: Cell): number {
  let n = 0;
  for (const id of c.links) {
    if (id >= 0 && !cells[id]!.courtyard) n += 1;
  }
  return n;
}

function canLink(_cells: Cell[], a: Cell, b: Cell, start: Cell): boolean {
  if (a.courtyard || b.courtyard) return false;
  if (a.gx === start.gx && b.gx === start.gx && a.gy !== b.gy) return false;
  return true;
}

export function deadEndLengths(cells: Cell[], startId: number): number[] {
  const start = cells[startId]!;
  const lens: number[] = [];
  for (const c of cells) {
    if (c.courtyard || c.id === start.id) continue;
    if (mazeDegree(cells, c) !== 1) continue;
    let prev = -1;
    let cur = c.id;
    let len = 0;
    while (cur >= 0) {
      const cell = cells[cur]!;
      const deg = mazeDegree(cells, cell);
      if (deg !== 1 && deg !== 2) break;
      len += 1;
      const nxt = [...cell.links].find((id) => id >= 0 && !cells[id]!.courtyard && id !== prev);
      if (nxt === undefined) break;
      if (mazeDegree(cells, cells[nxt]!) > 2) break;
      prev = cur;
      cur = nxt;
      if (len > 40) break;
    }
    if (len > 0) lens.push(len);
  }
  return lens;
}

function pruneHairlineStubs(cells: Cell[], start: Cell): void {
  for (const c of cells) {
    if (c.courtyard || c.id === start.id) continue;
    if (mazeDegree(cells, c) !== 1) continue;
    const extra = c.neighbors.find((n) => !c.links.has(n) && canLink(cells, c, cells[n]!, start));
    if (extra === undefined) continue;
    // only collapse true 1-cell stubs
    const only = [...c.links].find((id) => id >= 0 && !cells[id]!.courtyard);
    if (only === undefined) continue;
    if (mazeDegree(cells, cells[only]!) > 2) {
      c.links.add(extra);
      cells[extra]!.links.add(c.id);
    }
  }
}

function trimLongDeadEnds(cells: Cell[], start: Cell, maxLen: number): void {
  for (let k = 0; k < 24; k++) {
    const lens = deadEndLengths(cells, start.id);
    if (!lens.length || Math.max(...lens) <= maxLen) return;
    let leaf: Cell | null = null;
    for (const c of cells) {
      if (c.courtyard || c.id === start.id) continue;
      if (mazeDegree(cells, c) === 1) {
        leaf = c;
        break;
      }
    }
    if (!leaf) return;
    const extra = leaf.neighbors.find((n) => !leaf!.links.has(n) && canLink(cells, leaf!, cells[n]!, start));
    if (extra === undefined) return;
    leaf.links.add(extra);
    cells[extra]!.links.add(leaf.id);
  }
}

export function pathTurns(maze: Maze, path: number[]): number {
  let turns = 0;
  for (let i = 2; i < path.length; i++) {
    const a = maze.cells[path[i - 2]!]!;
    const b = maze.cells[path[i - 1]!]!;
    const c = maze.cells[path[i]!]!;
    const d1x = b.gx - a.gx;
    const d1y = b.gy - a.gy;
    const d2x = c.gx - b.gx;
    const d2y = c.gy - b.gy;
    if (d1x !== d2x || d1y !== d2y) turns += 1;
  }
  return turns;
}

export function hasAwayIsNear(maze: Maze, path: number[]): boolean {
  for (let i = 1; i < path.length - 1; i++) {
    const b = maze.cells[path[i]!]!;
    if (b.courtyard) continue;
    if (mazeDegree(maze.cells, b) < 3) continue;
    const c = maze.cells[path[i + 1]!]!;
    if (Math.hypot(c.x, c.y) > Math.hypot(b.x, b.y) + 0.12) return true;
  }
  return false;
}

export function seesIsolationEarly(maze: Maze): boolean {
  const toDoor = cellPathToCenter(maze);
  if (!toDoor) return false;
  const doorHops = toDoor.length - 1;
  const start = maze.startCell;
  const q = [start];
  const dist = new Map<number, number>([[start, 0]]);
  for (let i = 0; i < q.length; i++) {
    const id = q[i]!;
    const d = dist.get(id)!;
    if (d > Math.max(6, Math.floor(doorHops * 0.5))) continue;
    const c = maze.cells[id]!;
    if (!c.courtyard) {
      for (const n of c.neighbors) {
        const o = maze.cells[n]!;
        if (o.courtyard && !c.links.has(n)) return true;
      }
    }
    for (const n of c.links) {
      if (n < 0 || dist.has(n) || maze.cells[n]!.courtyard) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return false;
}

export function keyOppositeDoor(maze: Maze): boolean {
  if (!maze.keyPos) return false;
  const mouth = maze.cells[maze.mouth.mazeId]!;
  const court = maze.cells[maze.mouth.courtId]!;
  const dx = mouth.gx - court.gx;
  const dy = mouth.gy - court.gy;
  const k = maze.keyPos;
  if (dx > 0) return k.x < -maze.cellSize * 0.35;
  if (dx < 0) return k.x > maze.cellSize * 0.35;
  if (dy < 0) return k.y > maze.cellSize * 0.35;
  return false;
}

function extractWalls(cells: Cell[], cellSize: number, cfg: LevelConfig, start: Cell): Stroke[] {
  const half = cellSize * 0.5;
  const raw: Stroke[] = [];
  const seen = new Set<string>();
  const addFace = (mx: number, my: number, dx: number) => {
    const key = `${mx.toFixed(3)}:${my.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (dx !== 0) raw.push({ kind: "seg", a: { x: mx, y: my - half }, b: { x: mx, y: my + half } });
    else raw.push({ kind: "seg", a: { x: mx - half, y: my }, b: { x: mx + half, y: my } });
  };
  for (const c of cells) {
    for (const [dx, dy] of DIRS) {
      const nid = c.neighbors.find((n) => cells[n]!.gx === c.gx + dx && cells[n]!.gy === c.gy + dy);
      if (nid === undefined) {
        // Mid-bottom gate: leave the start cell's south face open.
        if (c.id === start.id && dy === 1) continue;
        addFace(c.x + dx * half, c.y + dy * half, dx);
        continue;
      }
      if (nid < c.id) continue;
      if (c.links.has(nid)) continue;
      const o = cells[nid]!;
      addFace((c.x + o.x) * 0.5, (c.y + o.y) * 0.5, dx);
    }
  }
  return mergeOrtho(raw, cfg.wallWidth);
}

function mergeOrtho(raw: Stroke[], wallWidth: number): Stroke[] {
  const segs = raw.filter((s): s is Extract<Stroke, { kind: "seg" }> => s.kind === "seg");
  const others = raw.filter((s) => s.kind !== "seg");
  const horiz = segs.filter((s) => Math.abs(s.a.y - s.b.y) < 1e-4);
  const vert = segs.filter((s) => Math.abs(s.a.x - s.b.x) < 1e-4);
  const merged: Stroke[] = [...others, ...mergeRuns(horiz, true), ...mergeRuns(vert, false)];
  const minGap = wallWidth + MIN_CORRIDOR * 0.55;
  const keptH: Extract<Stroke, { kind: "seg" }>[] = [];
  const hs = merged.filter((s): s is Extract<Stroke, { kind: "seg" }> => s.kind === "seg" && Math.abs(s.a.y - s.b.y) < 1e-4);
  hs.sort((a, b) => a.a.y - b.a.y);
  for (const s of hs) {
    const prev = keptH[keptH.length - 1];
    if (prev && Math.abs(prev.a.y - s.a.y) < minGap && overlap1d(prev.a.x, prev.b.x, s.a.x, s.b.x) > 0.2) continue;
    keptH.push(s);
  }
  const keptV: Extract<Stroke, { kind: "seg" }>[] = [];
  const vs = merged.filter((s): s is Extract<Stroke, { kind: "seg" }> => s.kind === "seg" && Math.abs(s.a.x - s.b.x) < 1e-4);
  vs.sort((a, b) => a.a.x - b.a.x);
  for (const s of vs) {
    const prev = keptV[keptV.length - 1];
    if (prev && Math.abs(prev.a.x - s.a.x) < minGap && overlap1d(prev.a.y, prev.b.y, s.a.y, s.b.y) > 0.2) continue;
    keptV.push(s);
  }
  return [...others, ...keptH, ...keptV];
}

function mergeRuns(segs: Extract<Stroke, { kind: "seg" }>[], horiz: boolean): Stroke[] {
  type Run = { k: number; lo: number; hi: number };
  const runs: Run[] = [];
  for (const s of segs) {
    const k = horiz ? s.a.y : s.a.x;
    const a = horiz ? s.a.x : s.a.y;
    const b = horiz ? s.b.x : s.b.y;
    runs.push({ k, lo: Math.min(a, b), hi: Math.max(a, b) });
  }
  runs.sort((a, b) => a.k - b.k || a.lo - b.lo);
  const out: Stroke[] = [];
  let cur: Run | null = null;
  for (const r of runs) {
    if (!cur || Math.abs(r.k - cur.k) > 1e-4 || r.lo > cur.hi + 0.08) {
      if (cur) out.push(runStroke(cur, horiz));
      cur = { ...r };
    } else cur.hi = Math.max(cur.hi, r.hi);
  }
  if (cur) out.push(runStroke(cur, horiz));
  return out;
}

function runStroke(r: { k: number; lo: number; hi: number }, horiz: boolean): Stroke {
  return horiz
    ? { kind: "seg", a: { x: r.lo, y: r.k }, b: { x: r.hi, y: r.k } }
    : { kind: "seg", a: { x: r.k, y: r.lo }, b: { x: r.k, y: r.hi } };
}

function overlap1d(a0: number, a1: number, b0: number, b1: number): number {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return Math.max(0, hi - lo);
}

function tessellate(strokes: Stroke[]): { a: Vec2; b: Vec2 }[] {
  const segs: { a: Vec2; b: Vec2 }[] = [];
  for (const s of strokes) {
    if (s.kind === "seg") segs.push({ a: s.a, b: s.b });
    else if (s.kind === "radial") segs.push({ a: polar(s.ri, s.th), b: polar(s.ro, s.th) });
    else {
      const span = angLerp(s.th0, s.th1);
      const n = Math.max(8, Math.ceil((s.r * span) / 0.28));
      const a0 = angNorm(s.th0);
      for (let i = 0; i < n; i++) {
        segs.push({
          a: polar(s.r, a0 + (span * i) / n),
          b: polar(s.r, a0 + (span * (i + 1)) / n),
        });
      }
    }
  }
  return segs;
}

function isApproach(maze: Maze, s: Extract<Stroke, { kind: "seg" }>): boolean {
  const ap = maze.approach;
  return (
    (Math.abs(s.a.x - ap.x0) < 0.05 && Math.abs(s.b.x - ap.x0) < 0.05) ||
    (Math.abs(s.a.x - ap.x1) < 0.05 && Math.abs(s.b.x - ap.x1) < 0.05) ||
    (Math.abs(s.a.y - ap.y1) < 0.05 && Math.abs(s.b.y - ap.y1) < 0.05)
  );
}

export function punchHole(maze: Maze, world: Vec2, width = HOLE_WIDTH): boolean {
  let best = -1;
  let bestD = 0.85;
  for (let i = 0; i < maze.strokes.length; i++) {
    const s = maze.strokes[i]!;
    const d = distToStroke(world, s);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return false;
  const s = maze.strokes[best]!;
  if (s.kind === "seg" && isApproach(maze, s)) return false;
  const next: Stroke[] = [];
  if (s.kind === "arc") {
    const th = angNorm(Math.atan2(world.y, world.x));
    const hole = width / Math.max(0.6, s.r);
    const a0 = angNorm(s.th0);
    const span = angLerp(s.th0, s.th1);
    let x = th;
    if (x < a0) x += Math.PI * 2;
    const g0 = x - hole * 0.5;
    const g1 = x + hole * 0.5;
    if (g0 > a0 + 0.04) next.push({ kind: "arc", r: s.r, th0: a0, th1: Math.min(g0, a0 + span) });
    if (g1 < a0 + span - 0.04) next.push({ kind: "arc", r: s.r, th0: Math.max(g1, a0), th1: a0 + span });
  } else if (s.kind === "radial") {
    const hitR = Math.hypot(world.x, world.y);
    const g0 = hitR - width * 0.5;
    const g1 = hitR + width * 0.5;
    if (g0 - s.ri > 0.12) next.push({ kind: "radial", th: s.th, ri: s.ri, ro: g0 });
    if (s.ro - g1 > 0.12) next.push({ kind: "radial", th: s.th, ri: g1, ro: s.ro });
  } else {
    const hit = distToSegment(world, s.a, s.b);
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const t0 = Math.max(0, hit.t - width / (2 * len));
    const t1 = Math.min(1, hit.t + width / (2 * len));
    if (t0 > 0.08) next.push({ kind: "seg", a: s.a, b: { x: s.a.x + dx * t0, y: s.a.y + dy * t0 } });
    if (t1 < 0.92) next.push({ kind: "seg", a: { x: s.a.x + dx * t1, y: s.a.y + dy * t1 }, b: s.b });
  }
  maze.strokes.splice(best, 1, ...next);
  maze.segments = tessellate(maze.strokes);
  return true;
}

function distToStroke(p: Vec2, s: Stroke): number {
  if (s.kind === "seg") return distToSegment(p, s.a, s.b).dist;
  if (s.kind === "radial") return distToSegment(p, polar(s.ri, s.th), polar(s.ro, s.th)).dist;
  const n = 8;
  const span = angLerp(s.th0, s.th1);
  const a0 = angNorm(s.th0);
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const a = polar(s.r, a0 + (span * i) / n);
    const b = polar(s.r, a0 + (span * (i + 1)) / n);
    best = Math.min(best, distToSegment(p, a, b).dist);
  }
  return best;
}

function placeKey(maze: Maze, rng: () => number, startId: number): Vec2 | null {
  const mouth = maze.cells[maze.mouth.mazeId]!;
  const court = maze.cells[maze.mouth.courtId]!;
  const dx = mouth.gx - court.gx;
  const dy = mouth.gy - court.gy;
  const cands = maze.cells.filter((c) => {
    if (c.courtyard || c.id === startId) return false;
    if (Math.max(Math.abs(c.x), Math.abs(c.y)) <= maze.hedge + maze.cellSize * 0.6) return false;
    if (dx > 0 && c.x >= -maze.cellSize * 0.4) return false;
    if (dx < 0 && c.x <= maze.cellSize * 0.4) return false;
    if (dy < 0 && c.y <= maze.cellSize * 0.4) return false;
    return true;
  });
  shuffle(cands, rng);
  const pick = cands.find((c) => shortestPath(maze, maze.start, (p) => dist(p, { x: c.x, y: c.y }) < 0.5));
  return pick ? { x: pick.x, y: pick.y } : null;
}

function placeChaser(maze: Maze, rng: () => number): Vec2 {
  const far = maze.cells.filter((c) => !c.courtyard && dist({ x: c.x, y: c.y }, maze.start) > maze.outerR * 0.75);
  shuffle(far, rng);
  const pick = far[0] ?? maze.cells[0]!;
  return { x: pick.x, y: pick.y };
}

function placeGrass(maze: Maze, rng: () => number): Grass[] {
  const from = maze.chaserSpawn;
  const vision = CHASER_VISION;
  const openWall = maze.cells.filter((c) => {
    if (c.courtyard || c.id === maze.startCell) return false;
    const d = dist(from, { x: c.x, y: c.y });
    return d > 1.05 && d <= vision && !rayHitsWall(maze, from, { x: c.x, y: c.y });
  });
  if (openWall.length < 2) throw new Error("few wall-open LOS cells");
  shuffle(openWall, rng);
  const catchCell = openWall.reduce((best, c) => (dist(from, c) > dist(from, best) ? c : best));
  const r = maze.cellSize * 0.38;
  const grass: Grass[] = [];
  const rest = openWall.filter((c) => c.id !== catchCell.id);
  for (const c of rest) {
    if (grass.length >= 3) break;
    const t = 0.52 + rng() * 0.18;
    const p = { x: from.x + (c.x - from.x) * t, y: from.y + (c.y - from.y) * t };
    if (distToSegment(p, from, { x: catchCell.x, y: catchCell.y }).dist <= r + 0.1) continue;
    grass.push({ x: p.x, y: p.y, r });
  }
  const extras = maze.cells.filter(
    (c) => !c.courtyard && c.id !== maze.startCell && dist({ x: c.x, y: c.y }, from) > 1.4,
  );
  shuffle(extras, rng);
  for (const c of extras) {
    if (grass.length >= 4) break;
    if (distToSegment({ x: c.x, y: c.y }, from, { x: catchCell.x, y: catchCell.y }).dist <= r + 0.22) continue;
    if (grass.some((g) => dist(g, { x: c.x, y: c.y }) < maze.cellSize * 0.7)) continue;
    grass.push({ x: c.x, y: c.y, r: r * 0.9 });
  }
  if (!grass.length) throw new Error("no 隐藏草");
  return grass;
}

export function openLosCells(maze: Maze): Cell[] {
  const from = maze.chaserSpawn;
  return maze.cells.filter((c) => {
    if (c.courtyard) return false;
    const to = { x: c.x, y: c.y };
    const d = dist(from, to);
    return d > 1.05 && d <= CHASER_VISION && !rayHitsWall(maze, from, to) && !rayHitsGrass(maze, from, to);
  });
}

export function coveredLosCells(maze: Maze): Cell[] {
  const from = maze.chaserSpawn;
  return maze.cells.filter((c) => {
    if (c.courtyard) return false;
    const to = { x: c.x, y: c.y };
    const d = dist(from, to);
    return d > 1.05 && d <= CHASER_VISION && !rayHitsWall(maze, from, to) && rayHitsGrass(maze, from, to);
  });
}

export function walkableNeighbors(maze: Maze, id: number, locked: boolean): number[] {
  const c = maze.cells[id]!;
  const out: number[] = [];
  for (const n of c.links) {
    if (n < 0) continue;
    if (locked && maze.cells[n]!.courtyard) continue;
    out.push(n);
  }
  return out;
}

export function cellPathFrom(
  maze: Maze,
  fromId: number,
  goal: (id: number) => boolean,
  locked = false,
): number[] | null {
  const q = [fromId];
  const prev = new Map<number, number>([[fromId, -1]]);
  for (let i = 0; i < q.length; i++) {
    const id = q[i]!;
    if (goal(id)) {
      const path: number[] = [];
      let x: number | undefined = id;
      while (x !== undefined && x >= 0) {
        path.push(x);
        x = prev.get(x);
      }
      path.reverse();
      return path;
    }
    for (const n of walkableNeighbors(maze, id, locked)) {
      if (prev.has(n)) continue;
      prev.set(n, id);
      q.push(n);
    }
  }
  return null;
}

function cellBfs(cells: Cell[], from: number, goal: (id: number) => boolean): number[] | null {
  const q = [from];
  const prev = new Map<number, number>([[from, -1]]);
  for (let i = 0; i < q.length; i++) {
    const id = q[i]!;
    if (goal(id)) {
      const path: number[] = [];
      let x: number | undefined = id;
      while (x !== undefined && x >= 0) {
        path.push(x);
        x = prev.get(x);
      }
      path.reverse();
      return path;
    }
    for (const n of cells[id]!.links) {
      if (n < 0 || prev.has(n)) continue;
      prev.set(n, id);
      q.push(n);
    }
  }
  return null;
}

export function cellPathToCenter(maze: Maze): number[] | null {
  return cellBfs(maze.cells, maze.startCell, (id) => maze.cells[id]!.courtyard);
}

export function maxAlignedInward(maze: Maze, path: number[]): number {
  const start = maze.cells[maze.startCell]!;
  let max = 0;
  let run = 0;
  for (let i = 1; i < path.length; i++) {
    const a = maze.cells[path[i - 1]!]!;
    const b = maze.cells[path[i]!]!;
    const onCol = a.gx === start.gx && b.gx === start.gx;
    const towardCenter = b.y < a.y - 0.01;
    if (onCol && towardCenter) {
      run += 1;
      max = Math.max(max, run);
    } else run = 0;
  }
  return max;
}

export function hasRadialHighway(maze: Maze): boolean {
  let p: Vec2 = { x: maze.start.x, y: maze.start.y };
  const step = 0.14;
  for (let i = 0; i < 520; i++) {
    if (inCenter(p, maze.hedge - 0.05)) return true;
    const next = collideMove(maze, p, PLAYER_RADIUS, 0, -step, false);
    if (p.y - next.y < step * 0.22) return false;
    p = next;
  }
  return inCenter(p, maze.hedge);
}

export function inCenter(p: Vec2, hedge: number): boolean {
  return Math.max(Math.abs(p.x), Math.abs(p.y)) < hedge;
}

function assertWinding(maze: Maze): void {
  if (hasRadialHighway(maze)) throw new Error("radial highway");
  const path = cellPathToCenter(maze);
  if (!path) throw new Error("no cell path");
  const minHops = minCellHops(maze.config);
  if (path.length - 1 < minHops) throw new Error(`short path ${path.length - 1} < ${minHops}`);
  if (maxAlignedInward(maze, path) > 2) throw new Error("aligned shaft");
  const geo = shortestPath(maze, maze.start, maze.hedge - 0.2, false);
  if (!geo) throw new Error("no path");
  const minGeo = minGeoSteps(maze.config);
  if (geo.steps < minGeo) throw new Error(`short geo ${geo.steps} < ${minGeo}`);
  if (courtMouthCount(maze.cells) !== 1) throw new Error("chamber mouth count");
  const mouths = courtMouths(maze);
  const m = maze.cells[mouths[0]!.mazeId]!;
  const o = maze.cells[mouths[0]!.courtId]!;
  if (m.gy > o.gy) throw new Error("south chamber mouth");
  assertPatterns(maze, path);
}

function assertPatterns(maze: Maze, path: number[]): void {
  const cfg = maze.config;
  const hops = path.length - 1;
  const turns = pathTurns(maze, path);
  const needTurns = cfg.pattern === "A" ? 1 : 2;
  if (turns < needTurns) throw new Error(`few turns ${turns}`);
  if (cfg.pattern !== "A" && !hasAwayIsNear(maze, path)) throw new Error("no away-is-near junction");
  const ends = deadEndLengths(maze.cells, maze.startCell);
  const hair = ends.filter((n) => n <= 1).length;
  const longest = ends.length ? Math.max(...ends) : 0;
  if (cfg.pattern === "A") {
    if (turns < 1) throw new Error("A needs a turn");
    if (longest > 3) throw new Error(`A long dead end ${longest}`);
    if (hair > 1) throw new Error(`A hairline stubs ${hair}`);
  }
  if (cfg.pattern === "B") {
    if (hair > 0) throw new Error(`B hairline stubs ${hair}`);
    if (longest < Math.max(3, Math.ceil(hops * 0.3))) throw new Error(`B bait ${longest} < 30% of ${hops}`);
  }
  if (cfg.pattern === "D") {
    if (!seesIsolationEarly(maze)) throw new Error("D isolation not seen early");
  }
}

export function collideMove(maze: Maze, pos: Vec2, radius: number, dx: number, dy: number, respectLock = true): Vec2 {
  let x = pos.x + dx;
  let y = pos.y + dy;
  const r = radius + maze.wallHalf;
  const extra = respectLock && maze.locked ? [maze.cageDoor] : [];
  for (let k = 0; k < 5; k++) {
    let worst = 0;
    let nx = 0;
    let ny = 0;
    for (const s of maze.segments) {
      const hit = distToCapsule({ x, y }, s.a, s.b);
      const pen = r - hit.dist;
      if (pen > worst) {
        worst = pen;
        nx = hit.nx;
        ny = hit.ny;
      }
    }
    for (const s of extra) {
      const hit = distToCapsule({ x, y }, s.a, s.b);
      const pen = r - hit.dist;
      if (pen > worst) {
        worst = pen;
        nx = hit.nx;
        ny = hit.ny;
      }
    }
    const pd = Math.hypot(x, y);
    const body = maze.cage * 0.42;
    if (pd < body + radius) {
      const pen = body + radius - pd;
      if (pen > worst) {
        worst = pen;
        nx = pd < 1e-6 ? 0 : x / pd;
        ny = pd < 1e-6 ? 1 : y / pd;
      }
    }
    if (worst <= 0) break;
    x += nx * (worst + 0.001);
    y += ny * (worst + 0.001);
  }
  const lim = maze.outerR - radius * 0.15;
  return { x: clamp(x, -lim, lim), y: clamp(y, -lim, lim) };
}

function distToCapsule(p: Vec2, a: Vec2, b: Vec2): { dist: number; nx: number; ny: number } {
  const hit = distToSegment(p, a, b);
  return { dist: hit.dist, nx: hit.nx, ny: hit.ny };
}

export function inPlayableFloor(maze: Maze, p: Vec2): boolean {
  return Math.abs(p.x) <= maze.outerR + 0.04 && Math.abs(p.y) <= maze.outerR + 0.04;
}

export interface WalkablePath {
  points: Vec2[];
  steps: number;
}

export function shortestPath(
  maze: Maze,
  from: Vec2 = maze.start,
  goal: number | ((p: Vec2) => boolean) = maze.hedge - 0.2,
  respectLock = false,
): WalkablePath | null {
  const reached =
    typeof goal === "function" ? goal : (p: Vec2) => inCenter(p, typeof goal === "number" ? goal : maze.hedge - 0.2);
  const step = Math.min(0.38, maze.cellSize * 0.32);
  const dirs: Vec2[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 0.7, y: 0.7 },
    { x: 0.7, y: -0.7 },
    { x: -0.7, y: 0.7 },
    { x: -0.7, y: -0.7 },
  ];
  const bucket = 2.2;
  const grid = new Map<string, { a: Vec2; b: Vec2 }[]>();
  const segs = respectLock && maze.locked ? [...maze.segments, maze.cageDoor] : maze.segments;
  for (const s of segs) {
    const pad = maze.wallHalf + 0.5;
    const x0 = Math.floor((Math.min(s.a.x, s.b.x) - pad) / bucket);
    const x1 = Math.floor((Math.max(s.a.x, s.b.x) + pad) / bucket);
    const y0 = Math.floor((Math.min(s.a.y, s.b.y) - pad) / bucket);
    const y1 = Math.floor((Math.max(s.a.y, s.b.y) + pad) / bucket);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const k = `${ix}:${iy}`;
        const list = grid.get(k);
        if (list) list.push(s);
        else grid.set(k, [s]);
      }
    }
  }
  const collideFast = (pos: Vec2, dx: number, dy: number): Vec2 => {
    let x = pos.x + dx;
    let y = pos.y + dy;
    const r = PLAYER_RADIUS + maze.wallHalf;
    for (let k = 0; k < 5; k++) {
      let worst = 0;
      let nx = 0;
      let ny = 0;
      const bx = Math.floor(x / bucket);
      const by = Math.floor(y / bucket);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (const s of grid.get(`${bx + ox}:${by + oy}`) ?? []) {
            const hit = distToCapsule({ x, y }, s.a, s.b);
            const pen = r - hit.dist;
            if (pen > worst) {
              worst = pen;
              nx = hit.nx;
              ny = hit.ny;
            }
          }
        }
      }
      if (worst <= 0) break;
      x += nx * (worst + 0.001);
      y += ny * (worst + 0.001);
    }
    return { x, y };
  };
  const key = (p: Vec2) => `${Math.round(p.x / step)}:${Math.round(p.y / step)}`;
  const seen = new Set<string>([key(from)]);
  const q: { p: Vec2; d: number; prev: number }[] = [{ p: { ...from }, d: 0, prev: -1 }];
  for (let i = 0; i < q.length && i < 14000; i++) {
    const cur = q[i]!;
    if (reached(cur.p)) {
      const points: Vec2[] = [];
      let idx = i;
      while (idx >= 0) {
        points.push(q[idx]!.p);
        idx = q[idx]!.prev;
      }
      points.reverse();
      return { points, steps: cur.d };
    }
    for (const dir of dirs) {
      const want = collideFast(cur.p, dir.x * step, dir.y * step);
      if (!inPlayableFloor(maze, want)) continue;
      if (dist(cur.p, want) < step * 0.35) continue;
      const k = key(want);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ p: want, d: cur.d + 1, prev: i });
    }
  }
  return null;
}

export function rayHitsWall(maze: Maze, a: Vec2, b: Vec2): boolean {
  const n = Math.max(8, Math.ceil(dist(a, b) / 0.28));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    for (const s of maze.segments) {
      if (distToSegment(p, s.a, s.b).dist < maze.wallHalf + 0.12) return true;
    }
    if (maze.locked && distToSegment(p, maze.cageDoor.a, maze.cageDoor.b).dist < maze.wallHalf + 0.12) return true;
  }
  return false;
}

export function rayHitsGrass(maze: Maze, a: Vec2, b: Vec2): boolean {
  for (const g of maze.grass) {
    if (distToSegment({ x: g.x, y: g.y }, a, b).dist <= g.r) return true;
  }
  return false;
}

export function rayHitsCover(maze: Maze, a: Vec2, b: Vec2): boolean {
  return rayHitsWall(maze, a, b) || rayHitsGrass(maze, a, b);
}

export function cellAt(maze: Maze, p: Vec2): number {
  let best = -1;
  let bestD = Infinity;
  for (const c of maze.cells) {
    const d = dist(p, { x: c.x, y: c.y });
    if (d < bestD) {
      bestD = d;
      best = c.id;
    }
  }
  return best;
}

export function cellCenter(c: Cell): Vec2 {
  return { x: c.x, y: c.y };
}
