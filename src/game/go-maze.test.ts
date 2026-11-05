import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GO_PAIRS,
  VISION_N,
  buildLevelPair,
  facingIntoWall,
  pickCageSidePost,
  solveLevel,
  visionCells,
  type Dir,
  type Graph,
} from "./go-maze";

const DIRS: { dx: number; dy: number; f: Dir }[] = [
  { dx: 1, dy: 0, f: "E" },
  { dx: -1, dy: 0, f: "W" },
  { dx: 0, dy: 1, f: "S" },
  { dx: 0, dy: -1, f: "N" },
];

/** Old picker: first grid neighbor that is not a node, in E-W-S-N order. */
function legacyFacingIntoEmpty(graph: Graph, nodeId: string): Dir {
  const occupied = new Set(Object.values(graph.nodes).map((node) => `${node.x},${node.y}`));
  const origin = graph.nodes[nodeId];
  assert.ok(origin);
  for (const dir of DIRS) {
    if (!occupied.has(`${origin.x + dir.dx},${origin.y + dir.dy}`)) return dir.f;
  }
  return "S";
}

function linked(graph: Graph, a: string, b: string): boolean {
  return graph.edges.some(([u, v]) => (u === a && v === b) || (u === b && v === a));
}

/**
 * Full 5×5 node set, like the generator (walls are missing edges, not missing cells).
 * Camp sits on the east side so the cage is on the west edge. A north spur off the
 * cage is the only post that can look down a corridor without covering the rescue path.
 * The legacy picker faces that post west, off the board.
 */
function westEdgeCage(): Graph {
  const nodes: Graph["nodes"] = {};
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) nodes[`${x},${y}`] = { x, y };
  nodes.CAMP = { x: 4, y: 0 };
  nodes.CAGE = { x: 0, y: 2 };
  delete nodes["4,0"];
  delete nodes["0,2"];
  const edges: [string, string][] = [
    ["CAGE", "1,2"],
    ["1,2", "2,2"],
    ["2,2", "3,2"],
    ["3,2", "4,2"],
    ["4,2", "4,1"],
    ["4,1", "CAMP"],
    ["CAGE", "0,1"],
    ["CAGE", "0,3"],
    ["0,3", "0,4"],
    ["1,2", "1,3"],
    ["1,3", "1,4"],
  ];
  return { nodes, edges };
}

test("cage-side bow faces a walkable corridor, not west into empty", () => {
  const graph = westEdgeCage();
  const post = pickCageSidePost(graph, "CAGE", "CAMP", VISION_N);
  assert.ok(post, "a static post is placed beside the cage");
  assert.equal(post.node, "0,3");
  assert.equal(legacyFacingIntoEmpty(graph, post.node), "W");
  assert.equal(facingIntoWall(graph, post.node, "W"), true);
  assert.notEqual(post.facing, "W");
  assert.equal(facingIntoWall(graph, post.node, post.facing), false);

  const los = visionCells(graph, post.node, post.facing, VISION_N);
  assert.ok(los.length >= 1 && los.length <= VISION_N, `LOS length ${los.length} is outside 1..${VISION_N}`);
  assert.deepEqual(los, ["0,4"]);

  let prev = post.node;
  for (const id of los) {
    const cell = graph.nodes[id];
    assert.ok(cell, `${id} is a board cell`);
    assert.equal(linked(graph, prev, id), true, `${prev} → ${id} is a walkable edge`);
    const from = graph.nodes[prev];
    assert.ok(from);
    assert.equal(Math.abs(from.x - cell.x) + Math.abs(from.y - cell.y), 1);
    prev = id;
  }
  const origin = graph.nodes[post.node];
  assert.ok(origin);
  assert.ok(origin.x >= 0 && los.every((id) => (graph.nodes[id]?.x ?? -1) >= 0));
});

test("static N=3 chase pair stays solvable with a corridor bow", () => {
  const spec = GO_PAIRS[1];
  assert.ok(spec);
  assert.equal(spec.chaseKind, "static");
  const [explore, chase] = buildLevelPair(spec, 1);
  assert.equal(solveLevel(explore).solvable, true);
  const chased = solveLevel(chase);
  assert.equal(chased.solvable, true, "N=3 cage-side bow still leaves a rescue");
  assert.equal(chased.rescued, true);

  const enemy = chase.enemies[0];
  assert.ok(enemy);
  assert.equal(enemy.kind, "static");
  assert.equal(enemy.visionN, VISION_N);
  const node = enemy.path[0];
  assert.ok(node);
  const facing = enemy.facing;
  assert.ok(facing);
  assert.equal(facingIntoWall(chase.graph, node, facing), false);
  const los = visionCells(chase.graph, node, facing, enemy.visionN);
  assert.ok(los.length >= 1 && los.length <= VISION_N);
  const origin = chase.graph.nodes[node];
  assert.ok(origin);
  if (facing === "W") {
    const step = chase.graph.nodes[los[0] ?? ""];
    assert.ok(step);
    assert.equal(step.x, origin.x - 1);
    assert.equal(linked(chase.graph, node, los[0] ?? ""), true);
  }
  for (const id of los) {
    const cell = chase.graph.nodes[id];
    assert.ok(cell);
    assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x < spec.S && cell.y < spec.S);
  }
});

test("every GO pair stays solvable after the bow facing fix", () => {
  for (const [index, spec] of GO_PAIRS.entries()) {
    const [explore, chase] = buildLevelPair(spec, index);
    assert.equal(solveLevel(explore).solvable, true, `${spec.exploreName} explore`);
    const chased = solveLevel(chase);
    assert.equal(chased.solvable, true, `${spec.chaseName} chase`);
    assert.equal(chased.rescued, true, `${spec.chaseName} rescue`);
    if (spec.chaseKind !== "static") continue;
    const enemy = chase.enemies[0];
    assert.ok(enemy);
    const node = enemy.path[0];
    assert.ok(node);
    const facing = enemy.facing;
    assert.ok(facing, spec.chaseName);
    assert.equal(facingIntoWall(chase.graph, node, facing), false, spec.chaseName);
    const los = visionCells(chase.graph, node, facing, enemy.visionN ?? VISION_N);
    assert.ok(los.length >= 1 && los.length <= (enemy.visionN ?? VISION_N), spec.chaseName);
  }
});
