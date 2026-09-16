import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVELS } from "./levels";
import { generateMaze, nearestPunchableDist, punchHole } from "./maze";
import { applyRepairTap, isFloorCellTap, resolvePlayTap } from "./play-intent";

test("L2 corridor centers are floor taps even when punchHole would bite", () => {
  const maze = generateMaze(LEVELS[1]!);
  const cell = maze.cells.find((c) => !c.courtyard && punchHole(structuredClone(maze), { x: c.x, y: c.y }));
  assert.ok(cell, "need a corridor cell the old 0.85 snap would punch");
  assert.equal(isFloorCellTap(maze, cell), true, "cell center must be a floor tap");
  assert.equal(resolvePlayTap(maze, cell, false, 3), "move");
  assert.equal(resolvePlayTap(maze, cell, true, 3), "cancel-move");
  assert.equal(applyRepairTap(maze, cell), false, "repair hit radius must miss corridor centers");
});

test("rapid floor taps never spend 检修 charges", () => {
  const maze = generateMaze(LEVELS[1]!);
  const walkable = maze.cells.filter((c) => !c.courtyard).slice(0, 12);
  let punches = 0;
  for (const cell of walkable) {
    const action = resolvePlayTap(maze, { x: cell.x, y: cell.y }, false, 3);
    assert.notEqual(action, "repair", `floor cell ${cell.id} opened a vent`);
    if (action === "move" && applyRepairTap(structuredClone(maze), cell)) punches += 1;
  }
  assert.equal(punches, 0, "applyRepairTap must not fire on corridor centers");
});

test("wall-select mode spends a charge only after a successful opening", () => {
  const maze = generateMaze(LEVELS[1]!);
  const wall = maze.strokes.find((s) => s.kind === "seg" && nearestPunchableDist(maze, midpoint(s)) < 0.05);
  assert.ok(wall && wall.kind === "seg");
  const hit = midpoint(wall);
  assert.notEqual(resolvePlayTap(maze, hit, false, 3), "repair", "normal taps on walls must not punch");
  assert.equal(resolvePlayTap(maze, hit, true, 3), "repair");
  assert.equal(resolvePlayTap(maze, hit, true, 0), "offer-heart");
  const before = maze.strokes.length;
  assert.equal(applyRepairTap(maze, hit), true);
  assert.notEqual(maze.strokes.length, before);
});

test("repair mode can cancel without spending", () => {
  const maze = generateMaze(LEVELS[1]!);
  const start = maze.cells[maze.startCell]!;
  assert.equal(resolvePlayTap(maze, start, true, 3), "cancel-move");
  assert.equal(resolvePlayTap(maze, { x: 80, y: 80 }, true, 3), "cancel");
  const clone = structuredClone(maze);
  applyRepairTap(clone, start);
  assert.deepEqual(clone.strokes, maze.strokes);
});

function midpoint(s: { a: { x: number; y: number }; b: { x: number; y: number } }): { x: number; y: number } {
  return { x: (s.a.x + s.b.x) * 0.5, y: (s.a.y + s.b.y) * 0.5 };
}
