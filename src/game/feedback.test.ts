import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVELS } from "./levels";
import { cellPathFrom, generateMaze } from "./maze";
import { applyPath, createFeedback, feedbackPath, proximityValue, setHasKey } from "./feedback";

test("footprint set grows as the player walks cells", () => {
  const maze = generateMaze(LEVELS[0]!);
  const fb = createFeedback(maze, true);
  assert.equal(fb.visited.size, 1);
  assert.deepEqual(fb.trail, [maze.startCell]);
  const path = feedbackPath(maze, true);
  assert.ok(path.length >= 4, "L1 path too short to test footprints");
  applyPath(fb, path.slice(0, 4));
  assert.ok(fb.visited.size >= 4, `visited ${fb.visited.size} after 4 cells`);
  assert.deepEqual(fb.trail, path.slice(0, 4), "trail should follow walk order through cell centers");
  const before = fb.visited.size;
  const trailLen = fb.trail.length;
  applyPath(fb, path.slice(0, 4));
  assert.equal(fb.visited.size, before, "revisiting cells should not grow the set");
  assert.ok(fb.trail.length > trailLen, "backtracking should extend the polyline trail");
});

test("proximity is non-decreasing along the optimal path to isolation", () => {
  const maze = generateMaze(LEVELS[0]!);
  const fb = createFeedback(maze, true);
  const path = feedbackPath(maze, true);
  const values: number[] = [];
  for (const id of path) values.push(applyPath(fb, [id])[0]!.value);
  for (let i = 1; i < values.length; i++) {
    assert.ok(
      values[i]! + 1e-9 >= values[i - 1]!,
      `L1 proximity dropped at step ${i}: ${values[i - 1]?.toFixed(3)} → ${values[i]?.toFixed(3)}`,
    );
  }
  assert.ok(values[values.length - 1]! > values[0]!, "optimal walk should raise 接近");
  assert.ok(values[values.length - 1]! > 0.85, "arriving at isolation should fill the meter");
});

test("key levels use a dual-phase meter that stays non-decreasing in each phase", () => {
  const maze = generateMaze(LEVELS[10]!);
  const fb = createFeedback(maze, false);
  const toKey = feedbackPath(maze, false);
  assert.ok(toKey.length >= 3, "L11 key path too short");
  const keyVals: number[] = [];
  for (const id of toKey) keyVals.push(applyPath(fb, [id])[0]!.value);
  for (let i = 1; i < keyVals.length; i++) {
    assert.ok(keyVals[i]! + 1e-9 >= keyVals[i - 1]!, `key-phase drop at ${i}`);
  }
  assert.ok((keyVals.at(-1) ?? 0) >= 0.45, `key pickup should sit near mid-meter, got ${keyVals.at(-1)}`);
  setHasKey(fb, true);
  const afterKey = proximityValue(fb);
  assert.ok(Math.abs(afterKey - 0.5) < 0.08, `phase switch should stay near 50%, got ${afterKey}`);
  const rest = cellPathFrom(maze, fb.cellId, (id) => maze.cells[id]!.courtyard, false) ?? [fb.cellId];
  const isoVals: number[] = [];
  for (const id of rest) isoVals.push(applyPath(fb, [id])[0]!.value);
  for (let i = 1; i < isoVals.length; i++) {
    assert.ok(isoVals[i]! + 1e-9 >= isoVals[i - 1]!, `iso-phase drop at ${i}`);
  }
  assert.ok((isoVals.at(-1) ?? 0) > 0.9, "isolation arrival should fill the second half");
});
