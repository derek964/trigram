/**
 * Hitman GO–style node graph (undirected).
 * Positions are layout-only; movement uses adjacency only.
 */

export type NodeId = string;

export interface NodePos {
  x: number;
  y: number;
}

export interface Graph {
  /** Display / layout coords per node. */
  nodes: Record<NodeId, NodePos>;
  /** Undirected edges as [a, b] pairs (a !== b). */
  edges: readonly [NodeId, NodeId][];
}

/** Build adjacency list; each undirected edge adds both directions. */
export function adjacency(graph: Graph): Record<NodeId, NodeId[]> {
  const adj: Record<NodeId, NodeId[]> = {};
  for (const id of Object.keys(graph.nodes)) adj[id] = [];
  for (const [a, b] of graph.edges) {
    if (a === b) continue;
    if (!adj[a]) adj[a] = [];
    if (!adj[b]) adj[b] = [];
    if (!adj[a]!.includes(b)) adj[a]!.push(b);
    if (!adj[b]!.includes(a)) adj[b]!.push(a);
  }
  for (const id of Object.keys(adj)) adj[id]!.sort();
  return adj;
}

export function neighborsOf(graph: Graph, id: NodeId): NodeId[] {
  return adjacency(graph)[id] ?? [];
}

export function areAdjacent(graph: Graph, a: NodeId, b: NodeId): boolean {
  if (a === b) return false;
  return neighborsOf(graph, a).includes(b);
}
