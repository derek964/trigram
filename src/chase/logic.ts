/**
 * 追击夜 — turn-based grid rules (pure, no DOM).
 *
 * Map legend: '#' wall · '.' floor · 'P' volunteer start · 'A' caged animal · 'T' 抓宠贼 · 'E' exit (south gate)
 *
 * One turn = the volunteer steps 1 cell (N/E/S/W). The rescued queue trails like a snake.
 * Then the thief takes 2 single steps by the classic Minotaur rule: a horizontal step toward you if open,
 * else a vertical step toward you if open, else it stands still for that step.
 */
export type Dir = 0 | 1 | 2 | 3 | 4; // N E S W, 4 = 等待 (stay one turn)
export const WAIT: Dir = 4;
export const ALL_DIRS: readonly Dir[] = [0, 1, 2, 3, 4];
export const DIRS: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, 0],
];

export interface ChaseLevel {
  id: number;
  name: string;
  hint: string;
  map: string[];
}

export interface Board {
  w: number;
  h: number;
  wall: boolean[];
  exit: number;
  start: number;
  animals: number[]; // cage cells, rescue order irrelevant
  thief: number | null;
  /** Thin walls between neighbouring cells, keyed "a|b" with a<b (Theseus-style maps). */
  edges: Set<string>;
}

export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface State {
  p: number;
  q: number[]; // follower cells, q[0] right behind the volunteer
  qa: number[]; // follower animal indices (into board.animals)
  left: number[]; // animal indices still caged
  t: number | null;
  frozen: number; // thief turns to skip
  status: "play" | "win" | "caught";
  reason: string;
}

/**
 * Two map formats:
 * - block format: one char per cell ('#' blocked cell);
 * - thin-wall format (first row starts with '+'): cells sit at odd columns/rows, '|' and '-' between them are walls,
 *   '+' are posts. A cell written as '#' is a void (not part of the board).
 */
export function parse(map: string[]): Board {
  if (map[0]!.startsWith("+")) return parseThin(map);
  const h = map.length;
  const w = Math.max(...map.map((r) => r.length));
  const wall: boolean[] = [];
  let exit = -1;
  let start = -1;
  let thief: number | null = null;
  const animals: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = map[y]![x] ?? "#";
      const i = y * w + x;
      wall[i] = ch === "#";
      if (ch === "E") exit = i;
      if (ch === "P") start = i;
      if (ch === "A") animals.push(i);
      if (ch === "T") thief = i;
    }
  if (exit < 0 || start < 0) throw new Error("map needs P and E");
  return { w, h, wall, exit, start, animals, thief, edges: new Set() };
}

function parseThin(map: string[]): Board {
  const h = (map.length - 1) / 2;
  const w = (Math.max(...map.map((r) => r.length)) - 1) / 2;
  const wall: boolean[] = [];
  const edges = new Set<string>();
  let exit = -1;
  let start = -1;
  let thief: number | null = null;
  const animals: number[] = [];
  const at = (r: number, c: number) => map[r]?.[c] ?? " ";
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = at(2 * y + 1, 2 * x + 1);
      const i = y * w + x;
      wall[i] = ch === "#";
      if (ch === "E") exit = i;
      if (ch === "P") start = i;
      if (ch === "A") animals.push(i);
      if (ch === "T") thief = i;
      if (x + 1 < w && at(2 * y + 1, 2 * x + 2) === "|") edges.add(edgeKey(i, i + 1));
      if (y + 1 < h && at(2 * y + 2, 2 * x + 1) === "-") edges.add(edgeKey(i, i + w));
    }
  if (exit < 0 || start < 0) throw new Error("map needs P and E");
  return { w, h, wall, exit, start, animals, thief, edges };
}

export function initial(b: Board): State {
  return {
    p: b.start,
    q: [],
    qa: [],
    left: b.animals.map((_, i) => i),
    t: b.thief,
    frozen: 0,
    status: "play",
    reason: "",
  };
}

export function clone(s: State): State {
  return { ...s, q: s.q.slice(), qa: s.qa.slice(), left: s.left.slice() };
}

export function step(b: Board, c: number, d: Dir): number | null {
  if (d === 4) return c;
  const x = (c % b.w) + DIRS[d]![0];
  const y = Math.floor(c / b.w) + DIRS[d]![1];
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return null;
  const n = y * b.w + x;
  if (b.wall[n]) return null;
  return b.edges.size && b.edges.has(edgeKey(c, n)) ? null : n;
}

/**
 * Thief single step — classic Theseus & the Minotaur rule (Robert Abbott):
 * if a horizontal step toward you is open, take it; otherwise if a vertical step toward you is open, take it;
 * otherwise stand still for this step.
 */
export function thiefDir(b: Board, t: number, target: number): { dir: Dir | null; tried: Dir | null } {
  const dx = (target % b.w) - (t % b.w);
  const dy = Math.floor(target / b.w) - Math.floor(t / b.w);
  const h: Dir | null = dx > 0 ? 1 : dx < 0 ? 3 : null;
  const v: Dir | null = dy > 0 ? 2 : dy < 0 ? 0 : null;
  if (h !== null && step(b, t, h) !== null) return { dir: h, tried: h };
  if (v !== null && step(b, t, v) !== null) return { dir: v, tried: v };
  return { dir: null, tried: h ?? v };
}

export function thiefStep(b: Board, t: number, target: number): number {
  const { dir } = thiefDir(b, t, target);
  return dir === null ? t : step(b, t, dir)!;
}

export type MoveBlock = "wall" | "queue" | "thief" | "cage-closed" | "over";

/** Why the volunteer can't enter a cell (null = can). */
export function blockOf(b: Board, s: State, d: Dir): MoveBlock | null {
  if (s.status !== "play") return "over";
  if (d === 4) return null;
  const n = step(b, s.p, d);
  if (n === null) return "wall";
  if (s.q.includes(n)) return "queue";
  if (s.t === n) return "thief";
  if (n === b.exit && s.left.length > 0) return "cage-closed";
  return null;
}

export function move(b: Board, s0: State, d: Dir): State | null {
  if (blockOf(b, s0, d)) return null;
  const s = clone(s0);
  const n = step(b, s.p, d)!;
  const prev = s.p;
  s.p = n;
  // queue follows; grows by one when an animal is picked up (waiting: nobody moves)
  const ai = d === 4 ? -1 : s.left.findIndex((k) => b.animals[k] === n);
  if (d !== 4 && (s.q.length > 0 || ai >= 0)) {
    s.q.unshift(prev);
    if (ai >= 0) {
      s.qa.push(s.left[ai]!);
      s.left.splice(ai, 1);
    } else s.q.pop();
  }
  // first follower is the animal you picked up first? we keep qa order = pickup order, q order = nearest first.
  if (s.p === b.exit && s.left.length === 0) {
    s.status = "win";
    return s;
  }
  if (s.t !== null) {
    if (s.frozen > 0) {
      s.frozen--;
    } else {
      for (let k = 0; k < 2; k++) {
        s.t = thiefStep(b, s.t, s.p);
        if (s.t === s.p) {
          s.status = "caught";
          s.reason = "抓宠贼扑到了你身上";
          return s;
        }
        if (s.q.includes(s.t)) {
          s.status = "caught";
          s.reason = "抓宠贼抓走了队伍里的小动物";
          return s;
        }
      }
    }
  }
  return s;
}

/** Orthogonal neighbours the volunteer can step into this turn (path highlight). */
export function walkableCells(b: Board, s: State): number[] {
  const out: number[] = [];
  for (const d of [0, 1, 2, 3] as Dir[]) {
    if (blockOf(b, s, d)) continue;
    const n = step(b, s.p, d);
    if (n !== null) out.push(n);
  }
  return out;
}

/**
 * Cells the volunteer must not enter this turn (shown red).
 * Includes: immediate catch, and (when `winnable` is given) steps into proven lost positions.
 * Wait (Dir 4) never adds a cell — lost-on-wait is surfaced by the lost banner instead.
 */
export function dangerCells(b: Board, s: State, winnable?: Set<string>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const d of ALL_DIRS) {
    if (d === WAIT) continue;
    const n = move(b, s, d);
    if (!n) continue;
    let bad = n.status === "caught";
    if (!bad && n.status === "play" && winnable && !winnable.has(key(n))) bad = true;
    if (bad && !seen.has(n.p)) {
      seen.add(n.p);
      out.push(n.p);
    }
  }
  return out;
}

/** Thief reach this turn regardless of where you go (soft warning layer). */
export function thiefPath(b: Board, s: State): number[] {
  if (s.t === null || s.frozen > 0) return [];
  const a = thiefStep(b, s.t, s.p);
  return [a, thiefStep(b, a, s.p)];
}

export function key(s: State): string {
  return `${s.p}|${s.q.join(",")}|${s.left.join(",")}|${s.t}|${s.frozen}`;
}

export interface Solution {
  moves: Dir[];
  explored: number;
}

/** BFS over the full state (volunteer, queue, caged set, thief, freeze). */
export function solve(b: Board, s0: State, cap = 400000): Solution | null {
  if (s0.status === "win") return { moves: [], explored: 0 };
  if (s0.status !== "play") return null;
  const seen = new Map<string, { from: string | null; d: Dir | -1 }>();
  const k0 = key(s0);
  seen.set(k0, { from: null, d: -1 });
  let frontier: [State, string][] = [[s0, k0]];
  let explored = 0;
  while (frontier.length) {
    const next: [State, string][] = [];
    for (const [s, k] of frontier) {
      explored++;
      if (explored > cap) return null;
      for (const d of ALL_DIRS) {
        const n = move(b, s, d);
        if (!n || n.status === "caught") continue;
        const nk = n.status === "win" ? "WIN" : key(n);
        if (seen.has(nk)) continue;
        seen.set(nk, { from: k, d });
        if (n.status === "win") {
          const moves: Dir[] = [];
          let cur: string | null = nk;
          while (cur) {
            const e: { from: string | null; d: Dir | -1 } = seen.get(cur)!;
            if (e.d >= 0) moves.unshift(e.d as Dir);
            cur = e.from;
          }
          return { moves, explored };
        }
        next.push([n, nk]);
      }
    }
    frontier = next;
  }
  return null;
}

/** Next up-to-n cells on a winning line from here (rewarded hint). */
export function safeNext(b: Board, s: State, n = 3): number[] {
  const sol = solve(b, s);
  if (!sol) return [];
  const out: number[] = [];
  let cur = s;
  for (const d of sol.moves.slice(0, n)) {
    cur = move(b, cur, d)!;
    out.push(cur.p);
  }
  return out;
}

/** BFS distance through open floor (ignores the thief) — used for near-win detection. */
export function floorDist(b: Board, from: number, to: number): number {
  const dist = new Map<number, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c === to) return dist.get(c)!;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const n = step(b, c, d);
      if (n !== null && !dist.has(n)) {
        dist.set(n, dist.get(c)! + 1);
        q.push(n);
      }
    }
  }
  return Infinity;
}

export interface ThiefHop {
  from: number;
  to: number;
  dir: Dir; // intended direction
  blocked: boolean; // wall in the way → stands still
}

/** The thief's next two hops if the volunteer stands on `target` (default: current cell). */
export function thiefPlan(b: Board, s: State, target = s.p): ThiefHop[] {
  if (s.t === null || s.frozen > 0) return [];
  const out: ThiefHop[] = [];
  let t = s.t;
  for (let k = 0; k < 2; k++) {
    if (t === target) break;
    const { dir, tried } = thiefDir(b, t, target);
    if (tried === null) break;
    const n = dir === null ? t : step(b, t, dir)!;
    out.push({ from: t, to: n, dir: dir ?? tried, blocked: dir === null });
    t = n;
  }
  return out;
}

export interface Analysis {
  states: number;
  winnable: Set<string>;
  dead: number;
}

/** Retrograde analysis over the whole reachable state graph: which states can still be won. */
export function analyze(b: Board, s0: State = initial(b), cap = 200000): Analysis {
  const succ = new Map<string, string[]>();
  const preds = new Map<string, string[]>();
  const st = new Map<string, State>([[key(s0), s0]]);
  const q = [s0];
  const win = new Set<string>();
  const wq: string[] = [];
  while (q.length && st.size < cap) {
    const s = q.pop()!;
    const k = key(s);
    const out: string[] = [];
    for (const d of ALL_DIRS) {
      const n = move(b, s, d);
      if (!n || n.status === "caught") continue;
      if (n.status === "win") {
        if (!win.has(k)) {
          win.add(k);
          wq.push(k);
        }
        continue;
      }
      const nk = key(n);
      out.push(nk);
      let pr = preds.get(nk);
      if (!pr) preds.set(nk, (pr = []));
      pr.push(k);
      if (!st.has(nk)) {
        st.set(nk, n);
        q.push(n);
      }
    }
    succ.set(k, out);
  }
  while (wq.length) {
    const k = wq.pop()!;
    for (const p of preds.get(k) ?? [])
      if (!win.has(p)) {
        win.add(p);
        wq.push(p);
      }
  }
  return { states: st.size, winnable: win, dead: st.size - win.size };
}
