/**
 * Perfect / near-perfect orthogonal maze for A v2.
 * S = floor-lattice side length (written into level table).
 * Algorithm: Recursive Backtracker (§10 MVP braidRatio=0 perfect; Prim later). Corridor width 1.
 */
import type { Graph, NodeId, NodePos } from "./graph";
import { DEFAULT_VISION_N, visionCells, type Facing } from "./vision";
import type { E1Def } from "./logic";

const DIRS: ReadonlyArray<{ dx: number; dy: number; f: Facing }> = [
  { dx: 1, dy: 0, f: "E" },
  { dx: -1, dy: 0, f: "W" },
  { dx: 0, dy: 1, f: "S" },
  { dx: 0, dy: -1, f: "N" },
];

export const S0 = 7;

export type PlayMode = "explore" | "chase";

export interface MazeGenResult {
  graph: Graph;
  start: NodeId;
  cage: NodeId;
  safe: NodeId;
  S: number;
  seed: number;
  floorCount: number;
  wallCount: number;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function manhattan(a: NodePos, b: NodePos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function minCageDist(S: number): number {
  const soft = Math.floor(S * 1.2);
  return Math.max(S, soft);
}

/** BFS distances on the carved link graph (cell keys). */
function bfsDist(
  start: string,
  links: Map<string, Set<string>>,
): Map<string, number> {
  const dist = new Map<string, number>();
  const q: string[] = [start];
  dist.set(start, 0);
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    for (const n of links.get(cur) ?? []) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      q.push(n);
    }
  }
  return dist;
}

function reachable(a: string, b: string, links: Map<string, Set<string>>): boolean {
  return bfsDist(a, links).has(b);
}

/**
 * Carve an S×S floor lattice with recursive backtracker, then optional braid.
 * braidRatio=0 → perfect maze (no loops). Returns undirected `"x,y"` links.
 */
export function carveMaze(S: number, seed: number, braidRatio = 0): Map<string, Set<string>> {
  const rnd = mulberry32(seed);
  const cells: string[] = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) cells.push(key(x, y));
  }
  const links = new Map<string, Set<string>>();
  for (const c of cells) links.set(c, new Set());

  const visited = new Set<string>();
  const stack: string[] = [];
  const start = key(0, 0);
  visited.add(start);
  stack.push(start);

  while (stack.length) {
    const cur = stack[stack.length - 1]!;
    const [cx, cy] = cur.split(",").map(Number) as [number, number];
    const neigh = shuffle(
      DIRS.map(({ dx, dy }) => key(cx + dx, cy + dy)).filter((k) => links.has(k) && !visited.has(k)),
      rnd,
    );
    if (neigh.length === 0) {
      stack.pop();
      continue;
    }
    const next = neigh[0]!;
    links.get(cur)!.add(next);
    links.get(next)!.add(cur);
    visited.add(next);
    stack.push(next);
  }

  // Braid: add loops by knocking ~braidRatio of remaining walls between adjacent floors
  const candidates: [string, string][] = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const a = key(x, y);
      if (x + 1 < S) {
        const b = key(x + 1, y);
        if (!links.get(a)!.has(b)) candidates.push([a, b]);
      }
      if (y + 1 < S) {
        const b = key(x, y + 1);
        if (!links.get(a)!.has(b)) candidates.push([a, b]);
      }
    }
  }
  if (braidRatio > 0 && candidates.length) {
    const nBraid = Math.max(1, Math.floor(candidates.length * braidRatio));
    for (const [a, b] of shuffle(candidates, rnd).slice(0, nBraid)) {
      links.get(a)!.add(b);
      links.get(b)!.add(a);
    }
  }
  return links;
}

const CORNERS = (S: number): NodePos[] => [
  { x: 0, y: 0 },
  { x: S - 1, y: 0 },
  { x: 0, y: S - 1 },
  { x: S - 1, y: S - 1 },
];

function cellId(x: number, y: number, start: NodePos, cage: NodePos): NodeId {
  if (x === start.x && y === start.y) return "CAMP";
  if (x === cage.x && y === cage.y) return "CAGE";
  return key(x, y);
}

/**
 * Build a playable maze: corner spawn, far cage, BFS birth→cage→camp.
 * Retries seeds until layout constraints hold.
 */
export function generatePlayableMaze(
  S: number,
  baseSeed: number,
  cornerIndex = 0,
): MazeGenResult {
  const need = minCageDist(S);
  let lastErr = "unknown";
  for (let attempt = 0; attempt < 400; attempt++) {
    const seed = baseSeed + attempt * 104729;
    // §10 MVP: perfect maze (DFS / Recursive Backtracker); braidRatio 0
    const links = carveMaze(S, seed, 0);
    const corners = CORNERS(S);
    const startPos = corners[cornerIndex % 4]!;
    const startKey = key(startPos.x, startPos.y);

    // Prefer opposite-ish corner for cage; fall back to farthest reachable floor
    const candidates = [...corners]
      .filter((c) => !(c.x === startPos.x && c.y === startPos.y))
      .sort((a, b) => manhattan(b, startPos) - manhattan(a, startPos));

    let cagePos: NodePos | null = null;
    for (const c of candidates) {
      const ck = key(c.x, c.y);
      if (!reachable(startKey, ck, links)) continue;
      if (manhattan(startPos, c) >= need) {
        cagePos = c;
        break;
      }
    }
    if (!cagePos) {
      // farthest reachable by BFS hop count among all floors
      const dist = bfsDist(startKey, links);
      let best: { pos: NodePos; d: number; man: number } | null = null;
      for (const [k, d] of dist) {
        const [x, y] = k.split(",").map(Number) as [number, number];
        const man = manhattan(startPos, { x, y });
        if (man < need) continue;
        if (!best || d > best.d || (d === best.d && man > best.man)) {
          best = { pos: { x, y }, d, man };
        }
      }
      if (best) cagePos = best.pos;
    }
    if (!cagePos) {
      lastErr = `no cage ≥${need} from corner`;
      continue;
    }
    const cageKey = key(cagePos.x, cagePos.y);
    if (!reachable(startKey, cageKey, links)) {
      lastErr = "cage unreachable";
      continue;
    }
    // camp == start; birth→cage→camp == birth→cage→birth
    if (!reachable(cageKey, startKey, links)) {
      lastErr = "return path missing";
      continue;
    }

    const nodes: Record<NodeId, NodePos> = {};
    const edges: [NodeId, NodeId][] = [];
    const seenEdge = new Set<string>();
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const id = cellId(x, y, startPos, cagePos);
        nodes[id] = { x, y };
      }
    }
    for (const [a, set] of links) {
      const [ax, ay] = a.split(",").map(Number) as [number, number];
      const aId = cellId(ax, ay, startPos, cagePos);
      for (const b of set) {
        const [bx, by] = b.split(",").map(Number) as [number, number];
        const bId = cellId(bx, by, startPos, cagePos);
        const ek = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
        if (seenEdge.has(ek)) continue;
        seenEdge.add(ek);
        edges.push([aId, bId]);
      }
    }

    // Density: wall cells in padded AABB should dominate (no plazas — only carved floors)
    const boardW = S + 2;
    const total = boardW * boardW;
    const floorCount = S * S;
    const wallCount = total - floorCount;

    return {
      graph: { nodes, edges },
      start: "CAMP",
      cage: "CAGE",
      safe: "CAMP",
      S,
      seed,
      floorCount,
      wallCount,
    };
  }
  throw new Error(`generatePlayableMaze S=${S} failed: ${lastErr}`);
}


/** BFS parent map + path node set from start → goal. */
function bfsPathNodes(
  graph: Graph,
  start: NodeId,
  goal: NodeId,
): { path: Set<NodeId>; pred: Map<NodeId, NodeId | null> } {
  const adj = new Map<NodeId, NodeId[]>();
  for (const id of Object.keys(graph.nodes)) adj.set(id, []);
  for (const [a, b] of graph.edges) {
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  const pred = new Map<NodeId, NodeId | null>([[start, null]]);
  const q: NodeId[] = [start];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === goal) break;
    for (const n of adj.get(cur) ?? []) {
      if (pred.has(n)) continue;
      pred.set(n, cur);
      q.push(n);
    }
  }
  const path = new Set<NodeId>();
  if (pred.has(goal)) {
    let c: NodeId | null = goal;
    while (c) {
      path.add(c);
      c = pred.get(c) ?? null;
    }
  }
  return { path, pred };
}

function graphDist(graph: Graph, a: NodeId, b: NodeId): number {
  if (a === b) return 0;
  const adj = new Map<NodeId, NodeId[]>();
  for (const id of Object.keys(graph.nodes)) adj.set(id, []);
  for (const [u, v] of graph.edges) {
    adj.get(u)!.push(v);
    adj.get(v)!.push(u);
  }
  const dist = new Map<NodeId, number>([[a, 0]]);
  const q: NodeId[] = [a];
  while (q.length) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    for (const n of adj.get(cur) ?? []) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      if (n === b) return d + 1;
      q.push(n);
    }
  }
  return Infinity;
}

/**
 * Add exactly one orthogonal chord near `near` so a perfect maze gains a short cycle (for E2 ring).
 * Mutates graph.edges in place. Returns the new edge endpoints or null.
 */
export function addOneLoopNear(graph: Graph, near: NodeId, maxHop = 4): [NodeId, NodeId] | null {
  const floorAt = new Map<string, NodeId>();
  for (const [id, p] of Object.entries(graph.nodes)) floorAt.set(key(p.x, p.y), id);
  const linked = new Set<string>();
  for (const [a, b] of graph.edges) {
    linked.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  }
  const nearPos = graph.nodes[near];
  if (!nearPos) return null;
  type Cand = { a: NodeId; b: NodeId; score: number };
  const cands: Cand[] = [];
  for (const [id, p] of Object.entries(graph.nodes)) {
    if (graphDist(graph, near, id) > maxHop) continue;
    for (const { dx, dy } of DIRS) {
      const oid = floorAt.get(key(p.x + dx, p.y + dy));
      if (!oid || oid <= id) continue; // undirected once
      const ek = `${id}|${oid}`;
      if (linked.has(ek)) continue;
      // Chord closes a unique cycle of length graphDist(a,b)+1 — keep it in 4..8 for E2.
      const treeDist = graphDist(graph, id, oid);
      const cycleLen = treeDist + 1;
      if (cycleLen < 4 || cycleLen > 8) continue;
      const score =
        -graphDist(graph, near, id) - graphDist(graph, near, oid) - cycleLen;
      cands.push({ a: id, b: oid, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const pick = cands[0];
  if (!pick) return null;
  (graph.edges as [NodeId, NodeId][]).push([pick.a, pick.b]);
  return [pick.a, pick.b];
}

/** Prefer a real corridor; west last so west-edge posts stop staring off-board. */
const FACING_PREFERENCE: Facing[] = ["E", "S", "N", "W"];

/** True when the first step along facing has no walkable LOS cell. */
function facesIntoWall(graph: Graph, node: NodeId, facing: Facing): boolean {
  return visionCells(graph, node, facing, 1).length === 0;
}

/**
 * Longest walkable corridor facing of length 1..n that does not cover `blocked`
 * (usually the start→cage rescue path). Rejects out-of-bounds / wall steps.
 */
function corridorFacing(
  graph: Graph,
  node: NodeId,
  blocked: ReadonlySet<NodeId>,
  n: number,
): Facing | null {
  let best: { f: Facing; len: number } | null = null;
  for (const facing of FACING_PREFERENCE) {
    if (facesIntoWall(graph, node, facing)) continue;
    const los = visionCells(graph, node, facing, n);
    if (los.length < 1 || los.length > n) continue;
    if (los.some((id) => blocked.has(id))) continue;
    if (!best || los.length > best.len) best = { f: facing, len: los.length };
  }
  return best?.f ?? null;
}

/**
 * Static post near cage that does NOT sit on the unique start→cage approach tile
 * (perfect mazes often give cage degree 1 — blocking that neighbor makes the level unwinnable).
 * Facing must look down a walkable corridor (up to N), never out of bounds into empty.
 */
export function pickCageSidePost(
  graph: Graph,
  cage: NodeId,
  preferFacingAwayFrom: NodeId,
  visionN = DEFAULT_VISION_N,
): { node: NodeId; facing: Facing } | null {
  const { path, pred } = bfsPathNodes(graph, preferFacingAwayFrom, cage);
  const block = pred.get(cage); // mandatory hop onto cage
  const adj = new Map<NodeId, NodeId[]>();
  for (const id of Object.keys(graph.nodes)) adj.set(id, []);
  for (const [a, b] of graph.edges) {
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }

  type Opt = { node: NodeId; facing: Facing; score: number };
  const opts: Opt[] = [];
  for (const id of Object.keys(graph.nodes)) {
    if (id === cage || id === preferFacingAwayFrom) continue;
    if (id === block) continue; // never block the sole approach
    const dCage = graphDist(graph, cage, id);
    if (dCage < 1 || dCage > 3) continue;
    const onPath = path.has(id);
    const facing = corridorFacing(graph, id, path, visionN);
    if (!facing) continue;
    const losLen = visionCells(graph, id, facing, visionN).length;
    // Prefer off-path spurs close to cage with longer readable LOS
    const score =
      (onPath ? -100 : 40) - dCage * 3 + (adj.get(id)?.length === 1 ? 5 : 0) + losLen * 5;
    opts.push({ node: id, facing, score });
  }
  opts.sort((a, b) => b.score - a.score);
  if (opts[0]) return { node: opts[0].node, facing: opts[0].facing };

  // Fallback: any cage neighbor except the approach blocker, face into corridor
  for (const n of adj.get(cage) ?? []) {
    if (n === block || n === preferFacingAwayFrom) continue;
    const facing = corridorFacing(graph, n, path, visionN);
    if (facing) return { node: n, facing };
  }
  // Last resort: sit on blocker with a corridor facing if any (solvability still gates)
  if (block) {
    const facing = corridorFacing(graph, block, new Set(), visionN);
    if (facing) return { node: block, facing };
  }
  return null;
}

/** Walk a short orthogonal polyline from a start node for E1. */
export function pickPolylineNear(
  graph: Graph,
  origin: NodeId,
  len = 4,
): NodeId[] | null {
  const adj = new Map<NodeId, NodeId[]>();
  for (const id of Object.keys(graph.nodes)) adj.set(id, []);
  for (const [a, b] of graph.edges) {
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  for (const v of adj.values()) v.sort();

  // DFS path of length len without repeating
  const path: NodeId[] = [origin];
  const seen = new Set<NodeId>([origin]);
  const dfs = (): boolean => {
    if (path.length >= len) return true;
    const cur = path[path.length - 1]!;
    for (const n of adj.get(cur) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      path.push(n);
      if (dfs()) return true;
      path.pop();
      seen.delete(n);
    }
    return false;
  };
  if (!dfs()) return path.length >= 3 ? [...path] : null;
  return [...path];
}

/** Find a simple cycle of length 4–8 including a node near cage. */
export function pickRingNear(graph: Graph, near: NodeId): NodeId[] | null {
  const adj = new Map<NodeId, NodeId[]>();
  for (const id of Object.keys(graph.nodes)) adj.set(id, []);
  for (const [a, b] of graph.edges) {
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  const start = near;
  const stack: NodeId[] = [start];
  const idx = new Map<NodeId, number>([[start, 0]]);
  let found: NodeId[] | null = null;

  const dfs = (cur: NodeId, parent: NodeId | null): void => {
    if (found) return;
    for (const n of adj.get(cur) ?? []) {
      if (n === parent) continue;
      if (idx.has(n)) {
        const i = idx.get(n)!;
        const cycle = stack.slice(i);
        if (cycle.length >= 4 && cycle.length <= 8) {
          found = cycle;
          return;
        }
        continue;
      }
      idx.set(n, stack.length);
      stack.push(n);
      dfs(n, cur);
      stack.pop();
      idx.delete(n);
      if (found) return;
    }
  };
  dfs(start, null);
  return found;
}

export function buildChaseEnemies(
  graph: Graph,
  cage: NodeId,
  start: NodeId,
  kind: "static" | "polyline" | "ring",
  visionN = 3,
): E1Def[] {
  if (kind === "static") {
    const post = pickCageSidePost(graph, cage, start, visionN);
    if (!post) return [];
    return [
      {
        id: "e0-cage",
        kind: "static",
        path: [post.node],
        facing: post.facing,
        visionN,
      },
    ];
  }
  if (kind === "polyline") {
    const post = pickCageSidePost(graph, cage, start, visionN);
    const origin = post?.node ?? cage;
    const path = pickPolylineNear(graph, origin, 5);
    if (!path || path.length < 3) {
      return buildChaseEnemies(graph, cage, start, "static", visionN);
    }
    return [
      {
        id: "e1-cage",
        kind: "polyline",
        path,
        startIndex: 0,
        startDir: 1,
        visionN,
      },
    ];
  }
  // ring — perfect mazes have no cycles; chord one short loop near cage first
  const { path: critical } = bfsPathNodes(graph, start, cage);
  const post = pickCageSidePost(graph, cage, start, visionN);
  if (!pickRingNear(graph, post?.node ?? cage)) {
    addOneLoopNear(graph, post?.node ?? cage, 6);
  }
  // Gather candidate rings that avoid CAMP/CAGE and minimize critical-path overlap
  type RC = { path: NodeId[]; score: number };
  const cands: RC[] = [];
  const seeds = Object.keys(graph.nodes).filter((id) => id !== cage && id !== start);
  for (const id of seeds) {
    if (graphDist(graph, cage, id) > 6) continue;
    const r = pickRingNear(graph, id);
    if (!r || r.includes(cage) || r.includes(start)) continue;
    const overlap = r.reduce((n, x) => n + (critical.has(x) ? 1 : 0), 0);
    const near = Math.min(...r.map((x) => graphDist(graph, cage, x)));
    cands.push({ path: r, score: -overlap * 10 - near });
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  if (!best) return []; // let buildPair re-roll seed — do not silently downgrade to polyline
  return [
    {
      id: "e2-cage",
      kind: "ring",
      path: best.path,
      startIndex: 0,
      startDir: 1,
      visionN,
    },
  ];
}
