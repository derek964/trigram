/**
 * Hitman GO rewrite — node graph + E0/E1/E2 patrol + bow vision + cage rescue.
 *
 * Turn order (locked): player hops 1 adjacent edge → pickup animals on tile →
 * pre-tick bow-vision check → every enemy advances 1 beat (facing follows move) →
 * contact / vision check → if at safe with all required animals carried → win.
 * No wait / stay. No Theseus double-step. No open-map shortest-path chase.
 */
import { areAdjacent, neighborsOf, type Graph, type NodeId } from "./graph";
import {
  DEFAULT_VISION_N,
  facingBetween,
  visionCells,
  type Facing,
} from "./vision";

/** E0 static · E1 ping-pong · E2 rectangle/ring loop. */
export type PatrolKind = "static" | "polyline" | "ring";

export type { Facing };

/** Level authoring: fixed patrol route on graph nodes + bow facing. */
export interface E1Def {
  id: string;
  /** Ordered patrol nodes; consecutive entries should be graph-adjacent. Static = length 1. */
  path: readonly NodeId[];
  kind: PatrolKind;
  /** Index into path at level start (default 0). */
  startIndex?: number;
  /** Initial direction along path (default +1). Ignored for static. */
  startDir?: 1 | -1;
  /**
   * Bow facing. Required for readable static posts; for movers, defaults to the
   * first step along path (or startDir).
   */
  facing?: Facing;
  /** Bow vision range in floor cells (default 3; teaching may use 2). */
  visionN?: number;
}

export interface E1State {
  id: string;
  path: NodeId[];
  kind: PatrolKind;
  index: number;
  dir: 1 | -1;
  facing: Facing;
  visionN: number;
}

/** Unified rescue rule: touch animal/cage node → carry id; reach safe with all → win. */
export interface RescueDef {
  /** Animal ids keyed by the cage node where they sit until picked up. */
  animals: Readonly<Record<NodeId, string>>;
  /** Camp / exit node. */
  safe: NodeId;
  /** Animal ids that must be carried to win (defaults to all values in animals). */
  required?: readonly string[];
}

export type MoveResult =
  | { ok: true; from: NodeId; to: NodeId; caught: boolean; won: boolean; picked: string[] }
  | {
      ok: false;
      reason: "same-node" | "unknown-node" | "not-adjacent" | "wait-forbidden" | "not-playing";
    };

export interface GoState {
  graph: Graph;
  player: NodeId;
  steps: number;
  enemies: E1State[];
  /** Animals still on the board (cage node → animal id). */
  animalsLeft: Record<NodeId, string>;
  /** Carried animal ids. */
  carried: string[];
  safe: NodeId | null;
  required: string[];
  status: "play" | "caught" | "win";
  reason: string;
  /** Chebyshev exploration radius (A v2 fog). */
  visionR: number;
  /** Nodes ever seen (fog memory). */
  explored: Set<NodeId>;
  /** When true, bow catch only on fog-lit cells (§4 no dark arrows). */
  fogBowSafe: boolean;
}

export interface CreateOpts {
  enemies?: readonly E1Def[];
  rescue?: RescueDef | null;
  visionR?: number;
  /** Default true — §4 不暗箭未探索格. */
  fogBowSafe?: boolean;
  /** Seed explored (usually initial visible set). */
  explored?: Iterable<NodeId>;
}

export function enemyNode(e: E1State): NodeId {
  return e.path[e.index]!;
}

/** Current bow vision cells for an enemy (exclusive of its own tile). */
export function enemyVision(graph: Graph, e: E1State): NodeId[] {
  return visionCells(graph, enemyNode(e), e.facing, e.visionN);
}

function deriveInitialFacing(graph: Graph, d: E1Def, index: number, dir: 1 | -1): Facing {
  if (d.facing) return d.facing;
  if (d.path.length <= 1) return "S";
  if (d.kind === "ring") {
    const n = d.path.length;
    const next = ((index + dir) % n + n) % n;
    return facingBetween(graph, d.path[index]!, d.path[next]!) ?? "S";
  }
  // polyline: peek one step with reverse-at-end
  let nextIdx = index + dir;
  let useDir = dir;
  if (nextIdx < 0 || nextIdx >= d.path.length) {
    useDir = (dir === 1 ? -1 : 1) as 1 | -1;
    nextIdx = index + useDir;
  }
  if (nextIdx < 0 || nextIdx >= d.path.length) return "S";
  return facingBetween(graph, d.path[index]!, d.path[nextIdx]!) ?? "S";
}

/**
 * Advance one patrol beat in place. Static no-ops.
 * Ring wraps; polyline reverses at ends. Facing follows the step taken.
 */
export function tickE1(e: E1State, graph: Graph): void {
  if (e.kind === "static" || e.path.length <= 1) return;
  const from = e.path[e.index]!;
  if (e.kind === "ring") {
    const n = e.path.length;
    e.index = ((e.index + e.dir) % n + n) % n;
  } else {
    const next = e.index + e.dir;
    if (next < 0 || next >= e.path.length) {
      e.dir = (e.dir === 1 ? -1 : 1) as 1 | -1;
      e.index = e.index + e.dir;
    } else {
      e.index = next;
    }
  }
  const to = e.path[e.index]!;
  const face = facingBetween(graph, from, to);
  if (face) e.facing = face;
}

function buildEnemies(graph: Graph, enemies: readonly E1Def[]): E1State[] {
  return enemies.map((d) => {
    if (d.path.length < 1) throw new Error(`enemy ${d.id} empty path`);
    if (d.kind === "static" && d.path.length !== 1) {
      throw new Error(`enemy ${d.id} static requires path length 1`);
    }
    for (const n of d.path) {
      if (!(n in graph.nodes)) throw new Error(`enemy ${d.id} unknown node ${n}`);
    }
    const index = d.startIndex ?? 0;
    if (index < 0 || index >= d.path.length) throw new Error(`enemy ${d.id} bad startIndex`);
    const dir = d.startDir ?? 1;
    return {
      id: d.id,
      path: [...d.path],
      kind: d.kind,
      index,
      dir,
      facing: deriveInitialFacing(graph, d, index, dir),
      visionN: d.visionN ?? DEFAULT_VISION_N,
    };
  });
}

export function createState(graph: Graph, start: NodeId, opts: CreateOpts | readonly E1Def[] = {}): GoState {
  if (!(start in graph.nodes)) throw new Error(`unknown start node: ${start}`);
  const normalized: CreateOpts = Array.isArray(opts)
    ? { enemies: opts as readonly E1Def[] }
    : (opts as CreateOpts);
  const enemies = buildEnemies(graph, normalized.enemies ?? []);
  const rescue = normalized.rescue ?? null;
  const animalsLeft: Record<NodeId, string> = {};
  let safe: NodeId | null = null;
  let required: string[] = [];
  if (rescue) {
    if (!(rescue.safe in graph.nodes)) throw new Error(`unknown safe node: ${rescue.safe}`);
    safe = rescue.safe;
    for (const [node, id] of Object.entries(rescue.animals)) {
      if (!(node in graph.nodes)) throw new Error(`unknown animal node: ${node}`);
      animalsLeft[node] = id;
    }
    required = [...(rescue.required ?? Object.values(rescue.animals))];
  }
  const explored = new Set<NodeId>(normalized.explored ?? [start]);
  explored.add(start);
  return {
    graph,
    player: start,
    steps: 0,
    enemies,
    animalsLeft,
    carried: [],
    safe,
    required,
    status: "play",
    reason: "",
    visionR: normalized.visionR ?? 2,
    explored,
    fogBowSafe: normalized.fogBowSafe !== false,
  };
}

export function neighbors(state: GoState): NodeId[] {
  return neighborsOf(state.graph, state.player);
}

function inEnemyVision(state: GoState, node: NodeId): boolean {
  if (!state.enemies.some((e) => enemyVision(state.graph, e).includes(node))) return false;
  if (!state.fogBowSafe) return true;
  // §4: bow only resolves on currently explored cells (visible set merged into explored each hop by UI).
  // At catch time we treat "explored" as fog-lit knowledge from before this hop's fog expand —
  // UI should NOT add `node` to explored until after moveTo returns when testing dark-arrow.
  // Practical rule: if node was never explored, skip bow catch (contact still catches).
  return state.explored.has(node);
}

function collide(state: GoState): boolean {
  return state.enemies.some((e) => enemyNode(e) === state.player);
}

function pickup(state: GoState): string[] {
  const id = state.animalsLeft[state.player];
  if (!id) return [];
  delete state.animalsLeft[state.player];
  if (!state.carried.includes(id)) state.carried.push(id);
  return [id];
}

function allRescued(state: GoState): boolean {
  if (!state.safe || state.required.length === 0) return false;
  return state.required.every((id) => state.carried.includes(id));
}

function checkWin(state: GoState): boolean {
  if (!state.safe || state.player !== state.safe) return false;
  if (!allRescued(state)) return false;
  state.status = "win";
  state.reason = "小动物已护送到营地";
  return true;
}

function markCaught(state: GoState, reason: string): void {
  state.status = "caught";
  state.reason = reason;
}

/**
 * Move to an adjacent node, pickup, vision / E-tick, then resolve catch / win.
 * Same-node / wait is always rejected (no enemy tick).
 *
 * Catch rules:
 * - Walking into a kidnapper's *current* bow vision → caught (before they step).
 * - After patrol tick: same cell as enemy OR in their updated vision → caught.
 * - Landing on an enemy's cell is allowed if they leave that beat (classic GO dodge);
 *   post-tick same-cell still catches.
 */
export function moveTo(state: GoState, to: NodeId): MoveResult {
  if (state.status !== "play") return { ok: false, reason: "not-playing" };
  if (to === state.player) return { ok: false, reason: "wait-forbidden" };
  if (!(to in state.graph.nodes)) return { ok: false, reason: "unknown-node" };
  if (!areAdjacent(state.graph, state.player, to)) return { ok: false, reason: "not-adjacent" };

  const from = state.player;
  state.player = to;
  state.steps += 1;

  const picked = pickup(state);

  // Pre-tick: stepping into current LOS is fatal (not same-cell — allow dodge-through).
  if (inEnemyVision(state, state.player)) {
    markCaught(state, "进入绑架者弓视线");
    return { ok: true, from, to, caught: true, won: false, picked };
  }

  for (const e of state.enemies) tickE1(e, state.graph);

  if (collide(state)) {
    markCaught(state, "与巡逻者同节点");
    return { ok: true, from, to, caught: true, won: false, picked };
  }
  if (inEnemyVision(state, state.player)) {
    markCaught(state, "进入绑架者弓视线");
    return { ok: true, from, to, caught: true, won: false, picked };
  }

  const won = checkWin(state);
  return { ok: true, from, to, caught: false, won, picked };
}

/** Explicit wait/stay action — forbidden by v2. */
export function wait(_state: GoState): MoveResult {
  return { ok: false, reason: "wait-forbidden" };
}
