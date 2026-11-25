/**
 * Maze-grid presentation model for Hitman GO.
 * Rules kernel stays Graph (walkable cells = nodes, orthogonal neighbors = edges).
 * This module only derives a filled board (floor + solid wall cells) for drawing.
 */
import type { Graph, NodeId, NodePos } from "./graph";

export type CellKind = "floor" | "wall";

export interface GridCell {
  gx: number;
  gy: number;
  kind: CellKind;
  /** Named GO node sitting on this cell, if any. */
  nodeId?: NodeId;
}

export interface MazeBoard {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cells: GridCell[];
  /** "x,y" → node id for walkable named cells. */
  nodeAt: Map<string, NodeId>;
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Assert graph nodes sit on integer lattice (maze board requires it). */
export function assertIntegerNodes(graph: Graph): void {
  for (const [id, p] of Object.entries(graph.nodes)) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
      throw new Error(`maze grid: node ${id} must be integer, got (${p.x},${p.y})`);
    }
  }
}

/**
 * Build a padded AABB board: every named node is a floor cell; every other cell
 * in the padded bbox is a solid wall/obstacle. Edges stay on Graph — we do not
 * invent extra walkable cells (would change hop counts).
 */
export function boardFromGraph(graph: Graph, pad = 1): MazeBoard {
  assertIntegerNodes(graph);
  const positions = Object.entries(graph.nodes);
  if (positions.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, cells: [], nodeAt: new Map() };
  }
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const nodeAt = new Map<string, NodeId>();
  for (const [id, p] of positions) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    nodeAt.set(cellKey(p.x, p.y), id);
  }
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;

  const cells: GridCell[] = [];
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const key = cellKey(gx, gy);
      const nodeId = nodeAt.get(key);
      cells.push({
        gx,
        gy,
        kind: nodeId ? "floor" : "wall",
        nodeId,
      });
    }
  }
  return { minX, maxX, minY, maxY, cells, nodeAt };
}

/** All cell centers for camera framing (floors + walls). */
export function boardExtents(board: MazeBoard): NodePos[] {
  return board.cells.map((c) => ({ x: c.gx, y: c.gy }));
}

/**
 * Validate Graph edges are exactly orthogonal unit neighbors among floors.
 * Non-fatal for logic (adjacency still comes from edges), but catches authoring drift.
 */
export function validateOrthogonalEdges(graph: Graph): string[] {
  const errs: string[] = [];
  for (const [a, b] of graph.edges) {
    const pa = graph.nodes[a];
    const pb = graph.nodes[b];
    if (!pa || !pb) {
      errs.push(`missing node for edge ${a}-${b}`);
      continue;
    }
    const dx = Math.abs(pa.x - pb.x);
    const dy = Math.abs(pa.y - pb.y);
    if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) {
      errs.push(`edge ${a}-${b} not orthogonal unit step (Δ=${dx},${dy})`);
    }
  }
  return errs;
}
