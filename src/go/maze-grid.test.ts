import assert from "node:assert/strict";
import { test } from "node:test";
import { GO_LEVELS } from "./levels";
import { boardFromGraph, validateOrthogonalEdges } from "./maze-grid";

test("every GO level sits on integer orthogonal maze lattice", () => {
  for (const lv of GO_LEVELS) {
    const errs = validateOrthogonalEdges(lv.graph);
    assert.equal(errs.length, 0, `L${lv.id}: ${errs.join("; ")}`);
    const board = boardFromGraph(lv.graph, 1);
    const floors = board.cells.filter((c) => c.kind === "floor");
    const walls = board.cells.filter((c) => c.kind === "wall");
    assert.equal(floors.length, Object.keys(lv.graph.nodes).length);
    assert.ok(walls.length > 0, `L${lv.id} should have wall cells`);
    // every floor is a named node
    for (const f of floors) {
      assert.ok(f.nodeId, `floor at ${f.gx},${f.gy} needs nodeId`);
      assert.ok(lv.graph.nodes[f.nodeId]);
    }
  }
});
