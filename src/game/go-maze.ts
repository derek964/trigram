/**
 * Hitman GO maze generator for 拯救小动物.
 *
 * Static cage-side bows must look down a walkable corridor of at most
 * `VISION_N` cells. The previous facing picker returned the first grid
 * neighbor that is not a node (east, then west, then south, then north),
 * so a post on the west edge stared out of bounds into empty space and
 * its line of sight never entered the maze.
 */

export const VISION_N = 3;

export type Dir = "N" | "E" | "S" | "W";

export interface Graph {
  nodes: Record<string, { x: number; y: number }>;
  edges: [string, string][];
}

export interface CagePost {
  node: string;
  facing: Dir;
}

export type ChaseKind = "static" | "polyline" | "ring";

export interface EnemySpec {
  id: string;
  kind: ChaseKind;
  path: string[];
  facing?: Dir;
  startIndex?: number;
  startDir?: 1 | -1;
  visionN?: number;
}

export interface GoLevel {
  graph: Graph;
  start: string;
  enemies: EnemySpec[];
  rescue: { animals: Record<string, string>; safe: string };
  visionR: number;
  mode: "explore" | "chase";
  name: string;
}

export interface GoSpec {
  S: number;
  visionR: number;
  chaseKind: ChaseKind;
  exploreName: string;
  chaseName: string;
}

export interface SolveResult {
  solvable: boolean;
  rescued: boolean;
  states: number;
}

/** L7–L10 sized pairs. Index 1 is the static bow with vision N=3 ("笼旁长弓"). */
export const GO_PAIRS: GoSpec[] = [
  { S: 7, visionR: 3, chaseKind: "static", exploreName: "迷雾初角", chaseName: "笼边静哨" },
  { S: 8, visionR: 2, chaseKind: "static", exploreName: "密径加一", chaseName: "笼旁长弓" },
  { S: 9, visionR: 2, chaseKind: "polyline", exploreName: "九格密林", chaseName: "折返贴笼" },
  { S: 10, visionR: 2, chaseKind: "ring", exploreName: "十径远笼", chaseName: "环线看守" },
];

const DELTA: Record<Dir, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

const DIRS: { dx: number; dy: number; f: Dir }[] = [
  { dx: 1, dy: 0, f: "E" },
  { dx: -1, dy: 0, f: "W" },
  { dx: 0, dy: 1, f: "S" },
  { dx: 0, dy: -1, f: "N" },
];

/** Prefer a real corridor; west is only used when it is the longest walkable ray. */
const FACING_PREFERENCE: Dir[] = ["E", "S", "N", "W"];

const ANIMALS = ["rabbit", "pup", "fox", "rabbit", "pup", "fox", "rabbit", "pup"];
const POST_HOPS = 3;

function animal(index: number): string {
  return ANIMALS[index % ANIMALS.length] ?? "rabbit";
}

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

function adjacency(graph: Graph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const id of Object.keys(graph.nodes)) adj.set(id, []);
  for (const [a, b] of graph.edges) {
    if (a === b) continue;
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  return adj;
}

function coordIndex(graph: Graph): Map<string, string> {
  const at = new Map<string, string>();
  for (const [id, node] of Object.entries(graph.nodes)) at.set(keyOf(node.x, node.y), id);
  return at;
}

/**
 * Walkable cells in a straight orthogonal line of sight.
 * Stops at the first missing node (out of bounds) or missing edge (wall).
 * Never longer than `n`.
 */
export function visionCells(graph: Graph, nodeId: string, facing: Dir, n = VISION_N): string[] {
  const origin = graph.nodes[nodeId];
  if (!origin || n <= 0) return [];
  const { dx, dy } = DELTA[facing];
  const at = coordIndex(graph);
  const adj = adjacency(graph);
  const cells: string[] = [];
  let prev = nodeId;
  for (let step = 1; step <= n; step++) {
    const id = at.get(keyOf(origin.x + dx * step, origin.y + dy * step));
    if (!id) break;
    const neighbors = adj.get(prev);
    if (!neighbors?.includes(id)) break;
    cells.push(id);
    prev = id;
  }
  return cells;
}

/** True when the first step leaves the board or has no walkable edge (a wall). */
export function facingIntoWall(graph: Graph, nodeId: string, facing: Dir): boolean {
  return visionCells(graph, nodeId, facing, 1).length === 0;
}

function corridorFacing(graph: Graph, nodeId: string, blocked: Set<string>, n: number): Dir | null {
  let best: { f: Dir; len: number } | null = null;
  for (const facing of FACING_PREFERENCE) {
    if (facingIntoWall(graph, nodeId, facing)) continue;
    const los = visionCells(graph, nodeId, facing, n);
    if (los.length < 1 || los.length > n) continue;
    if (los.some((id) => blocked.has(id))) continue;
    if (!best || los.length > best.len) best = { f: facing, len: los.length };
  }
  return best?.f ?? null;
}

function hopDistance(graph: Graph, from: string, to: string): number {
  if (from === to) return 0;
  const adj = adjacency(graph);
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    if (id === undefined) break;
    const d = dist.get(id) ?? 0;
    for (const next of adj.get(id) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      if (next === to) return d + 1;
      queue.push(next);
    }
  }
  return Number.POSITIVE_INFINITY;
}

function shortestPath(graph: Graph, from: string, to: string): { path: Set<string>; pred: Map<string, string | null> } {
  const adj = adjacency(graph);
  const pred = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    if (id === undefined) break;
    if (id === to) break;
    for (const next of adj.get(id) ?? []) {
      if (pred.has(next)) continue;
      pred.set(next, id);
      queue.push(next);
    }
  }
  const path = new Set<string>();
  if (pred.has(to)) {
    let cursor: string | null = to;
    while (cursor) {
      path.add(cursor);
      cursor = pred.get(cursor) ?? null;
    }
  }
  return { path, pred };
}

/**
 * Place one static bow beside the cage.
 * The post stands off the rescue path and faces the longest walkable
 * corridor of length 1..n that does not cover that path. Out-of-bounds
 * and walled steps, including west into empty, are rejected.
 */
export function pickCageSidePost(graph: Graph, cageId: string, startId: string, n = VISION_N): CagePost | null {
  const { path, pred } = shortestPath(graph, startId, cageId);
  const door = pred.get(cageId) ?? null;
  const adj = adjacency(graph);
  const ranked: { node: string; score: number }[] = [];
  for (const id of Object.keys(graph.nodes)) {
    if (id === cageId || id === startId || id === door || path.has(id)) continue;
    const hops = hopDistance(graph, cageId, id);
    if (hops < 1 || hops > POST_HOPS) continue;
    const degree = adj.get(id)?.length ?? 0;
    ranked.push({ node: id, score: 40 - hops * 3 + (degree === 1 ? 5 : 0) });
  }
  ranked.sort((a, b) => b.score - a.score);
  for (const cand of ranked) {
    const facing = corridorFacing(graph, cand.node, path, n);
    if (facing) return { node: cand.node, facing };
  }
  for (const id of adj.get(cageId) ?? []) {
    if (id === door || id === startId || path.has(id)) continue;
    const facing = corridorFacing(graph, id, path, n);
    if (facing) return { node: id, facing };
  }
  return null;
}

function dirBetween(graph: Graph, from: string, to: string): Dir | null {
  const a = graph.nodes[from];
  const b = graph.nodes[to];
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 1 && dy === 0) return "E";
  if (dx === -1 && dy === 0) return "W";
  if (dx === 0 && dy === 1) return "S";
  if (dx === 0 && dy === -1) return "N";
  return null;
}

function findCycle(graph: Graph, start: string): string[] | null {
  const adj = adjacency(graph);
  const stack = [start];
  const index = new Map<string, number>([[start, 0]]);
  let found: string[] | null = null;
  const walk = (node: string, parent: string | null): void => {
    if (found) return;
    for (const next of adj.get(node) ?? []) {
      if (next === parent) continue;
      const seen = index.get(next);
      if (seen !== undefined) {
        const cycle = stack.slice(seen);
        if (cycle.length >= 4 && cycle.length <= 8) found = cycle;
        continue;
      }
      index.set(next, stack.length);
      stack.push(next);
      walk(next, node);
      stack.pop();
      index.delete(next);
      if (found) return;
    }
  };
  walk(start, null);
  return found;
}

function addShortcut(graph: Graph, near: string, maxDist: number): [string, string] | null {
  if (!graph.nodes[near]) return null;
  const at = coordIndex(graph);
  const linked = new Set(graph.edges.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  const options: { a: string; b: string; score: number }[] = [];
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (hopDistance(graph, near, id) > maxDist) continue;
    for (const { dx, dy } of DIRS) {
      const other = at.get(keyOf(node.x + dx, node.y + dy));
      if (!other || other <= id) continue;
      const mark = `${id}|${other}`;
      if (linked.has(mark)) continue;
      const cycleLen = hopDistance(graph, id, other) + 1;
      if (cycleLen < 4 || cycleLen > 8) continue;
      options.push({
        a: id,
        b: other,
        score: -hopDistance(graph, near, id) - hopDistance(graph, near, other) - cycleLen,
      });
    }
  }
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  if (!best) return null;
  graph.edges.push([best.a, best.b]);
  return [best.a, best.b];
}

function straightPatrol(graph: Graph, start: string, length: number): string[] | null {
  const adj = adjacency(graph);
  for (const list of adj.values()) list.sort();
  const path = [start];
  const seen = new Set([start]);
  const grow = (): boolean => {
    if (path.length >= length) return true;
    const tip = path[path.length - 1];
    if (tip === undefined) return false;
    for (const next of adj.get(tip) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      path.push(next);
      if (grow()) return true;
      path.pop();
      seen.delete(next);
    }
    return false;
  };
  if (grow()) return [...path];
  return path.length >= 3 ? [...path] : null;
}

function placeEnemies(graph: Graph, cageId: string, startId: string, kind: ChaseKind, visionN: number): EnemySpec[] {
  if (kind === "static") {
    const post = pickCageSidePost(graph, cageId, startId, visionN);
    return post ? [{ id: "e0-cage", kind: "static", path: [post.node], facing: post.facing, visionN }] : [];
  }
  if (kind === "polyline") {
    const post = pickCageSidePost(graph, cageId, startId, visionN);
    const anchor = post?.node ?? cageId;
    const path = straightPatrol(graph, anchor, 5);
    if (!path || path.length < 3) return placeEnemies(graph, cageId, startId, "static", visionN);
    return [{ id: "e1-cage", kind: "polyline", path, startIndex: 0, startDir: 1, visionN }];
  }
  const { path: solution } = shortestPath(graph, startId, cageId);
  const post = pickCageSidePost(graph, cageId, startId, visionN);
  const anchor = post?.node ?? cageId;
  findCycle(graph, anchor) ?? addShortcut(graph, anchor, 6);
  const ranked: { path: string[]; score: number }[] = [];
  for (const id of Object.keys(graph.nodes)) {
    if (hopDistance(graph, cageId, id) > 6) continue;
    const cycle = findCycle(graph, id);
    if (!cycle || cycle.includes(cageId) || cycle.includes(startId)) continue;
    const overlap = cycle.reduce((sum, node) => sum + (solution.has(node) ? 1 : 0), 0);
    const nearest = Math.min(...cycle.map((node) => hopDistance(graph, cageId, node)));
    ranked.push({ path: cycle, score: -overlap * 10 - nearest });
  }
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return best ? [{ id: "e2-cage", kind: "ring", path: best.path, startIndex: 0, startDir: 1, visionN }] : [];
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 1831565813;
    let e = Math.imul(t ^ (t >>> 15), 1 | t);
    e ^= e + Math.imul(e ^ (e >>> 7), 61 | e);
    return ((e ^ (e >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a === undefined || b === undefined) continue;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

function carve(size: number, seed: number): Map<string, Set<string>> {
  const rng = mulberry32(seed);
  const cells: string[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push(keyOf(x, y));
  const adj = new Map<string, Set<string>>();
  for (const cell of cells) adj.set(cell, new Set());
  const seen = new Set<string>();
  const stack: string[] = [];
  const origin = keyOf(0, 0);
  seen.add(origin);
  stack.push(origin);
  while (stack.length) {
    const tip = stack[stack.length - 1];
    if (tip === undefined) break;
    const [x, y] = tip.split(",").map(Number);
    const nx = x ?? 0;
    const ny = y ?? 0;
    const options = shuffle(
      DIRS.map(({ dx, dy }) => keyOf(nx + dx, ny + dy)).filter((id) => adj.has(id) && !seen.has(id)),
      rng,
    );
    const next = options[0];
    if (!next) {
      stack.pop();
      continue;
    }
    adj.get(tip)?.add(next);
    adj.get(next)?.add(tip);
    seen.add(next);
    stack.push(next);
  }
  return adj;
}

function bfsDist(start: string, adj: Map<string, Set<string>>): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    if (id === undefined) break;
    const d = dist.get(id) ?? 0;
    for (const next of adj.get(id) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      queue.push(next);
    }
  }
  return dist;
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

interface MazeDraft {
  graph: Graph;
  start: string;
  cage: string;
  safe: string;
  S: number;
  seed: number;
}

function generatePlayableMaze(size: number, seed: number, corner: number): MazeDraft {
  const minFar = Math.max(size, Math.floor(size * 1.2));
  let reason = "unknown";
  for (let attempt = 0; attempt < 400; attempt++) {
    const usedSeed = seed + attempt * 104729;
    const carved = carve(size, usedSeed);
    const corners = [
      { x: 0, y: 0 },
      { x: size - 1, y: 0 },
      { x: 0, y: size - 1 },
      { x: size - 1, y: size - 1 },
    ];
    const camp = corners[corner % 4] ?? corners[0]!;
    const campKey = keyOf(camp.x, camp.y);
    const farFirst = corners
      .filter((cell) => !(cell.x === camp.x && cell.y === camp.y))
      .sort((a, b) => manhattan(b, camp) - manhattan(a, camp));
    let cage: { x: number; y: number } | null = null;
    for (const cell of farFirst) {
      if (bfsDist(campKey, carved).has(keyOf(cell.x, cell.y)) && manhattan(camp, cell) >= minFar) {
        cage = cell;
        break;
      }
    }
    if (!cage) {
      let best: { pos: { x: number; y: number }; d: number; man: number } | null = null;
      for (const [id, d] of bfsDist(campKey, carved)) {
        const [x, y] = id.split(",").map(Number);
        const pos = { x: x ?? 0, y: y ?? 0 };
        const man = manhattan(camp, pos);
        if (man < minFar) continue;
        if (!best || d > best.d || (d === best.d && man > best.man)) best = { pos, d, man };
      }
      if (best) cage = best.pos;
    }
    if (!cage) {
      reason = `no cage ≥${minFar} from corner`;
      continue;
    }
    const cageKey = keyOf(cage.x, cage.y);
    if (!bfsDist(campKey, carved).has(cageKey)) {
      reason = "cage unreachable";
      continue;
    }
    if (!bfsDist(cageKey, carved).has(campKey)) {
      reason = "return path missing";
      continue;
    }
    const nameAt = (x: number, y: number) => {
      if (x === camp.x && y === camp.y) return "CAMP";
      if (x === cage.x && y === cage.y) return "CAGE";
      return keyOf(x, y);
    };
    const nodes: Graph["nodes"] = {};
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) nodes[nameAt(x, y)] = { x, y };
    }
    const edges: [string, string][] = [];
    const seen = new Set<string>();
    for (const [id, nexts] of carved) {
      const [x, y] = id.split(",").map(Number);
      const a = nameAt(x ?? 0, y ?? 0);
      for (const other of nexts) {
        const [ox, oy] = other.split(",").map(Number);
        const b = nameAt(ox ?? 0, oy ?? 0);
        const mark = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(mark)) continue;
        seen.add(mark);
        edges.push([a, b]);
      }
    }
    return { graph: { nodes, edges }, start: "CAMP", cage: "CAGE", safe: "CAMP", S: size, seed: usedSeed };
  }
  throw new Error(`generatePlayableMaze S=${size} failed: ${reason}`);
}

function orthogonalErrors(graph: Graph): string[] {
  const errors: string[] = [];
  for (const [a, b] of graph.edges) {
    const pa = graph.nodes[a];
    const pb = graph.nodes[b];
    if (!pa || !pb) {
      errors.push(`missing node for edge ${a}-${b}`);
      continue;
    }
    const dx = Math.abs(pa.x - pb.x);
    const dy = Math.abs(pa.y - pb.y);
    if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) {
      errors.push(`edge ${a}-${b} not orthogonal unit step (Δ=${dx},${dy})`);
    }
  }
  return errors;
}

function enemyVisionN(kind: ChaseKind, index: number): number {
  return kind === "ring" || (kind === "static" && index === 0) ? 2 : VISION_N;
}

export function buildLevelPair(spec: GoSpec, index: number): [GoLevel, GoLevel] {
  const corner = index % 4;
  const seed0 = 9000 + spec.S * 17 + index * 13;
  const visionN = enemyVisionN(spec.chaseKind, index);
  let reason = "unsolvable chase";
  for (let attempt = 0; attempt < 80; attempt++) {
    let maze: MazeDraft;
    try {
      maze = generatePlayableMaze(spec.S, seed0 + attempt * 7919, corner);
    } catch (err) {
      reason = err instanceof Error ? err.message : "maze failed";
      continue;
    }
    const ortho = orthogonalErrors(maze.graph);
    if (ortho.length) {
      reason = ortho.join("; ");
      continue;
    }
    const enemies = placeEnemies(maze.graph, maze.cage, maze.start, spec.chaseKind, visionN);
    if (enemies.length === 0) {
      reason = "no enemy placed";
      continue;
    }
    const explore: GoLevel = {
      name: spec.exploreName,
      graph: maze.graph,
      start: maze.start,
      enemies: [],
      rescue: { animals: { [maze.cage]: animal(index * 2) }, safe: maze.safe },
      visionR: spec.visionR,
      mode: "explore",
    };
    const chase: GoLevel = {
      name: spec.chaseName,
      graph: maze.graph,
      start: maze.start,
      enemies,
      rescue: { animals: { [maze.cage]: animal(index * 2 + 1) }, safe: maze.safe },
      visionR: spec.visionR,
      mode: "chase",
    };
    const explored = solveLevel(explore, 80_000);
    const chased = solveLevel(chase, 120_000);
    if (!explored.solvable || !explored.rescued) {
      reason = `explore unsolvable/no-rescue states=${explored.states} rescued=${explored.rescued}`;
      continue;
    }
    if (!chased.solvable || !chased.rescued) {
      reason = `chase unsolvable/no-rescue states=${chased.states} rescued=${chased.rescued}`;
      continue;
    }
    return [explore, chase];
  }
  throw new Error(`buildPair S=${spec.S} ${spec.chaseKind}: ${reason}`);
}

interface Enemy {
  id: string;
  path: string[];
  kind: ChaseKind;
  index: number;
  dir: 1 | -1;
  facing: Dir;
  visionN: number;
}

interface Play {
  graph: Graph;
  player: string;
  enemies: Enemy[];
  animalsLeft: Record<string, string>;
  carried: string[];
  safe: string | null;
  required: string[];
  status: "play" | "win" | "caught";
}

function initialFacing(graph: Graph, spec: EnemySpec, index: number, dir: 1 | -1): Dir {
  if (spec.facing) return spec.facing;
  if (spec.path.length <= 1) return "S";
  if (spec.kind === "ring") {
    const len = spec.path.length;
    const ahead = ((index + dir) % len + len) % len;
    const from = spec.path[index];
    const to = spec.path[ahead];
    if (from === undefined || to === undefined) return "S";
    return dirBetween(graph, from, to) ?? "S";
  }
  let cursor = index + dir;
  let step = dir;
  if (cursor < 0 || cursor >= spec.path.length) {
    step = dir === 1 ? -1 : 1;
    cursor = index + step;
  }
  const from = spec.path[index];
  const to = spec.path[cursor];
  if (from === undefined || to === undefined) return "S";
  return dirBetween(graph, from, to) ?? "S";
}

function instantiate(graph: Graph, spec: EnemySpec): Enemy {
  if (spec.path.length < 1) throw new Error(`enemy ${spec.id} empty path`);
  if (spec.kind === "static" && spec.path.length !== 1) {
    throw new Error(`enemy ${spec.id} static requires path length 1`);
  }
  for (const node of spec.path) {
    if (!(node in graph.nodes)) throw new Error(`enemy ${spec.id} unknown node ${node}`);
  }
  const index = spec.startIndex ?? 0;
  if (index < 0 || index >= spec.path.length) throw new Error(`enemy ${spec.id} bad startIndex`);
  const dir = spec.startDir ?? 1;
  return {
    id: spec.id,
    path: [...spec.path],
    kind: spec.kind,
    index,
    dir,
    facing: initialFacing(graph, spec, index, dir),
    visionN: spec.visionN ?? VISION_N,
  };
}

function enemyNode(enemy: Enemy): string {
  return enemy.path[enemy.index] ?? enemy.path[0] ?? "";
}

function moveEnemy(enemy: Enemy, graph: Graph): void {
  if (enemy.kind === "static" || enemy.path.length <= 1) return;
  const previous = enemyNode(enemy);
  if (enemy.kind === "ring") {
    const len = enemy.path.length;
    enemy.index = ((enemy.index + enemy.dir) % len + len) % len;
  } else {
    const next = enemy.index + enemy.dir;
    if (next < 0 || next >= enemy.path.length) {
      enemy.dir = enemy.dir === 1 ? -1 : 1;
      enemy.index += enemy.dir;
    } else {
      enemy.index = next;
    }
  }
  const facing = dirBetween(graph, previous, enemyNode(enemy));
  if (facing) enemy.facing = facing;
}

function bowSees(play: Play, node: string): boolean {
  return play.enemies.some((enemy) => visionCells(play.graph, enemyNode(enemy), enemy.facing, enemy.visionN).includes(node));
}

function clonePlay(play: Play): Play {
  return {
    graph: play.graph,
    player: play.player,
    enemies: play.enemies.map((enemy) => ({ ...enemy, path: [...enemy.path] })),
    animalsLeft: { ...play.animalsLeft },
    carried: [...play.carried],
    safe: play.safe,
    required: [...play.required],
    status: play.status,
  };
}

function signature(play: Play): string {
  const enemies = play.enemies.map((enemy) => `${enemy.index}:${enemy.dir}:${enemy.facing}`).join(",");
  const carried = [...play.carried].sort().join(",");
  const left = Object.keys(play.animalsLeft).sort().join(",");
  return `${play.player}|${enemies}|${carried}|${left}|${play.status}`;
}

function step(play: Play, to: string): { ok: boolean; caught: boolean; won: boolean; picked: boolean } {
  if (play.status !== "play") return { ok: false, caught: false, won: false, picked: false };
  if (to === play.player) return { ok: false, caught: false, won: false, picked: false };
  if (!(to in play.graph.nodes)) return { ok: false, caught: false, won: false, picked: false };
  const neighbors = adjacency(play.graph).get(play.player) ?? [];
  if (!neighbors.includes(to)) return { ok: false, caught: false, won: false, picked: false };
  play.player = to;
  let picked = false;
  const animalId = play.animalsLeft[play.player];
  if (animalId) {
    delete play.animalsLeft[play.player];
    if (!play.carried.includes(animalId)) play.carried.push(animalId);
    picked = true;
  }
  if (bowSees(play, play.player)) {
    play.status = "caught";
    return { ok: true, caught: true, won: false, picked };
  }
  for (const enemy of play.enemies) moveEnemy(enemy, play.graph);
  if (play.enemies.some((enemy) => enemyNode(enemy) === play.player)) {
    play.status = "caught";
    return { ok: true, caught: true, won: false, picked };
  }
  if (bowSees(play, play.player)) {
    play.status = "caught";
    return { ok: true, caught: true, won: false, picked };
  }
  const delivered =
    !!play.safe &&
    play.required.length > 0 &&
    play.player === play.safe &&
    play.required.every((id) => play.carried.includes(id));
  if (delivered) play.status = "win";
  return { ok: true, caught: false, won: delivered, picked };
}

/** Breadth-first rescue: camp → cage → camp, without waiting or stepping into a bow. */
export function solveLevel(level: GoLevel, stateCap = 50_000): SolveResult {
  const required = [...Object.values(level.rescue.animals)];
  const start: Play = {
    graph: level.graph,
    player: level.start,
    enemies: level.enemies.map((spec) => instantiate(level.graph, spec)),
    animalsLeft: { ...level.rescue.animals },
    carried: [],
    safe: level.rescue.safe,
    required,
    status: "play",
  };
  if (required.length > 0 && required.every((id) => start.carried.includes(id)) && start.player === start.safe) {
    return { solvable: true, rescued: true, states: 1 };
  }
  const seen = new Set([signature(start)]);
  const queue: Play[] = [start];
  let states = 1;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const play = queue[cursor];
    if (!play) break;
    for (const next of adjacency(play.graph).get(play.player) ?? []) {
      const copy = clonePlay(play);
      const moved = step(copy, next);
      if (!moved.ok || moved.caught) continue;
      states += 1;
      if (states > stateCap) return { solvable: false, rescued: false, states };
      if (moved.won) return { solvable: true, rescued: copy.carried.length > 0, states };
      const sig = signature(copy);
      if (seen.has(sig)) continue;
      seen.add(sig);
      queue.push(copy);
    }
  }
  return { solvable: false, rescued: false, states };
}
