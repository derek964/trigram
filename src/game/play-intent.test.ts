import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVELS } from "./levels";
import { cellPathFrom, generateMaze, nearestPunchableDist, punchHole, walkableNeighbors } from "./maze";
import { applyRepairTap, isFloorCellTap, resolvePlayTap, resolveTapMove } from "./play-intent";

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

test("repair mode on a distant floor cell cancels without punching", () => {
  const maze = generateMaze(LEVELS[1]!);
  const start = maze.cells[maze.startCell]!;
  const far = maze.cells.find((c) => !c.courtyard && c.id !== start.id && !start.neighbors.includes(c.id));
  assert.ok(far);
  assert.equal(resolvePlayTap(maze, far, true, 3), "cancel-move");
  assert.equal(resolveTapMove(maze, start, far).kind, "far");
  assert.equal(applyRepairTap(structuredClone(maze), far), false);
});

test("linked neighbor is a one-cell step, not an A* route", () => {
  const maze = generateMaze(LEVELS[0]!);
  const start = maze.cells[maze.startCell]!;
  const nid = [...start.links][0];
  assert.ok(nid !== undefined);
  const n = maze.cells[nid]!;
  const intent = resolveTapMove(maze, start, n);
  assert.equal(intent.kind, "step");
  if (intent.kind === "step") {
    assert.equal(intent.from, start.id);
    assert.equal(intent.to, n.id);
  }
});

test("a distant corridor cell is far even when A* could walk there", () => {
  const maze = generateMaze(LEVELS[0]!);
  const start = maze.cells[maze.startCell]!;
  const far = maze.cells.find(
    (c) => !c.courtyard && c.id !== start.id && !start.links.has(c.id) && !start.neighbors.includes(c.id),
  );
  assert.ok(far, "need a corridor cell more than one grid step away");
  const path = cellPathFrom(maze, start.id, (id) => id === far.id, false);
  assert.ok(path && path.length > 2, "old tap-to-move would have auto-walked this path");
  assert.equal(resolveTapMove(maze, start, far).kind, "far");
});

test("grid neighbor behind a wall is blocked", () => {
  const maze = generateMaze(LEVELS[0]!);
  const cell = maze.cells.find((c) => !c.courtyard && c.neighbors.some((n) => !c.links.has(n)));
  assert.ok(cell, "need a cell with a walled-off neighbor");
  const wallN = cell.neighbors.find((n) => !cell.links.has(n))!;
  assert.equal(resolveTapMove(maze, cell, maze.cells[wallN]!).kind, "blocked");
});

test("locked 隔离间 neighbor is blocked until the cage opens", () => {
  const maze = generateMaze(LEVELS[10]!);
  assert.equal(maze.locked, true);
  const mouth = maze.cells[maze.mouth.mazeId]!;
  const court = maze.cells[maze.mouth.courtId]!;
  assert.equal(resolveTapMove(maze, mouth, court).kind, "blocked");
  maze.locked = false;
  assert.equal(resolveTapMove(maze, mouth, court).kind, "step");
});

test("no south-gate floor tap is a multi-cell auto-walk", () => {
  const maze = generateMaze(LEVELS[0]!);
  const start = maze.cells[maze.startCell]!;
  const walkable = new Set(walkableNeighbors(maze, start.id, maze.locked));
  for (const cell of maze.cells) {
    const intent = resolveTapMove(maze, start, cell);
    if (cell.id === start.id || !isFloorCellTap(maze, cell)) {
      assert.equal(intent.kind, "miss", `cell ${cell.id} should miss`);
      continue;
    }
    if (walkable.has(cell.id)) assert.equal(intent.kind, "step", `neighbor ${cell.id} should step`);
    else assert.notEqual(intent.kind, "step", `cell ${cell.id} must not auto-walk`);
  }
});

function midpoint(s: { a: { x: number; y: number }; b: { x: number; y: number } }): { x: number; y: number } {
  return { x: (s.a.x + s.b.x) * 0.5, y: (s.a.y + s.b.y) * 0.5 };
}
