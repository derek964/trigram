/**
 * Bow vision for Hitman GO A — cardinal LOS along facing, walls block, no bend.
 */
import type { Graph, NodeId } from "./graph";

export type Facing = "N" | "E" | "S" | "W";

export const DEFAULT_VISION_N = 3;

const DELTA: Record<Facing, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

/** Lattice "x,y" → node id for floor cells. */
export function floorIndex(graph: Graph): Map<string, NodeId> {
  const m = new Map<string, NodeId>();
  for (const [id, p] of Object.entries(graph.nodes)) {
    m.set(`${p.x},${p.y}`, id);
  }
  return m;
}

/** Cardinal facing from an orthogonal unit step, or null if not unit-ortho. */
export function facingBetween(graph: Graph, from: NodeId, to: NodeId): Facing | null {
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

/**
 * Walkable floor cells within `n` steps along `facing` from `origin` (exclusive).
 * Stops at the first missing lattice cell (out of bounds / solid) OR missing
 * graph edge (maze wall between adjacent floors). No diagonal or bend.
 */
export function visionCells(
  graph: Graph,
  origin: NodeId,
  facing: Facing,
  n: number,
): NodeId[] {
  const pos = graph.nodes[origin];
  if (!pos || n <= 0) return [];
  const { dx, dy } = DELTA[facing];
  const at = floorIndex(graph);
  const linked = new Set<string>();
  for (const [a, b] of graph.edges) {
    linked.add(`${a}|${b}`);
    linked.add(`${b}|${a}`);
  }
  const out: NodeId[] = [];
  let prev = origin;
  for (let i = 1; i <= n; i++) {
    const id = at.get(`${pos.x + dx * i},${pos.y + dy * i}`);
    if (!id) break; // out of bounds / missing cell
    if (!linked.has(`${prev}|${id}`)) break; // wall (no edge)
    out.push(id);
    prev = id;
  }
  return out;
}
