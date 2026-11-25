/**
 * Exploration fog — Chebyshev R, wall occlusion via Bresenham LOS,
 * explored memory keeps faint outlines.
 */
import type { Graph, NodeId, NodePos } from "./graph";

export function chebyshev(a: NodePos, b: NodePos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function floorIndex(graph: Graph): Map<string, NodeId> {
  const m = new Map<string, NodeId>();
  for (const [id, p] of Object.entries(graph.nodes)) m.set(`${p.x},${p.y}`, id);
  return m;
}

/** Lattice cells on Bresenham line from a→b, exclusive of a, inclusive of b. */
function bresenhamCells(a: NodePos, b: NodePos): NodePos[] {
  const cells: NodePos[] = [];
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
    cells.push({ x: x0, y: y0 });
  }
  return cells;
}

/**
 * LOS from origin floor to target lattice cell.
 * Intermediate lattice points must be floors; the endpoint may be floor or wall.
 */
export function hasLos(
  origin: NodePos,
  target: NodePos,
  floors: Map<string, NodeId>,
): boolean {
  if (origin.x === target.x && origin.y === target.y) return true;
  const cells = bresenhamCells(origin, target);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const isEnd = i === cells.length - 1;
    const k = `${c.x},${c.y}`;
    if (!floors.has(k) && !isEnd) return false; // wall mid-ray blocks
  }
  return true;
}

export interface FogFrame {
  /** Floor node ids currently lit. */
  visible: Set<NodeId>;
  /** Lattice keys "x,y" for walls currently lit (silhouette). */
  visibleWalls: Set<string>;
}

/** Visible floors + adjacent wall silhouettes within Chebyshev R with LOS. */
export function computeFog(
  graph: Graph,
  originId: NodeId,
  R: number,
): FogFrame {
  const visible = new Set<NodeId>();
  const visibleWalls = new Set<string>();
  const origin = graph.nodes[originId];
  if (!origin || R < 0) return { visible, visibleWalls };
  const floors = floorIndex(graph);
  visible.add(originId);

  for (const [id, p] of Object.entries(graph.nodes)) {
    if (id === originId) continue;
    if (chebyshev(origin, p) > R) continue;
    if (hasLos(origin, p, floors)) visible.add(id);
  }

  // Wall cells in AABB of floors ±1 that are within R and have LOS
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of Object.values(graph.nodes)) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  for (let y = minY - 1; y <= maxY + 1; y++) {
    for (let x = minX - 1; x <= maxX + 1; x++) {
      const k = `${x},${y}`;
      if (floors.has(k)) continue;
      if (chebyshev(origin, { x, y }) > R) continue;
      if (hasLos(origin, { x, y }, floors)) visibleWalls.add(k);
    }
  }
  return { visible, visibleWalls };
}

export function mergeExplored(
  explored: Set<NodeId>,
  exploredWalls: Set<string>,
  frame: FogFrame,
): void {
  for (const id of frame.visible) explored.add(id);
  for (const w of frame.visibleWalls) exploredWalls.add(w);
}

/** Player fog knowledge for bow-safe rule. */
export function isFogLit(
  nodeId: NodeId,
  explored: ReadonlySet<NodeId>,
  visible: ReadonlySet<NodeId>,
): boolean {
  return explored.has(nodeId) || visible.has(nodeId);
}
