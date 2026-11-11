import assert from "node:assert/strict";
import { test } from "node:test";
import { PLANT_DISTANCE, artToWorld } from "./east-plant";
import { NSW_MEASURED_STEP, WALK_CYCLE_DISTANCE } from "./motion";
import { NORTH_PLANT_DISTANCE, northLatch, northPose, stepNorthPlant } from "./north-plant";

test("north same-foot travel holds world x and is not the east plant", () => {
  const n0 = artToWorld({ x: 318, y: 599 });
  const n1 = artToWorld({ x: 254, y: 631 });
  const n2 = artToWorld({ x: 258, y: 569 });
  const n3 = artToWorld({ x: 194, y: 601 });
  assert.ok(Math.abs(n1.x - n0.x) < 1e-9);
  assert.ok(Math.abs(n1.y - n0.y - 0.256) < 1e-9);
  assert.ok(Math.abs(n3.x - n2.x) < 1e-9);
  assert.ok(Math.abs(n3.y - n2.y - 0.256) < 1e-9);
  assert.equal(NORTH_PLANT_DISTANCE, NSW_MEASURED_STEP);
  assert.equal(NSW_MEASURED_STEP * 4, WALK_CYCLE_DISTANCE);
  assert.notEqual(NORTH_PLANT_DISTANCE, PLANT_DISTANCE);
});

test("moving due north keeps the N0 support sole on one world latch", () => {
  const origin = { x: 5.5, y: 3.5 };
  const latch = northLatch(origin, 1);
  const moved = { x: origin.x, y: origin.y - NORTH_PLANT_DISTANCE };
  const trailing = artToWorld(northPose(1, NORTH_PLANT_DISTANCE).boots.find((boot) => boot.role === "support")!.sole);
  assert.ok(Math.abs(moved.x + trailing.x - latch.x) < 1e-9);
  assert.ok(Math.abs(moved.y + trailing.y - latch.y) < 1e-9);
  const stepped = stepNorthPlant(null, origin, { x: origin.x, y: origin.y - 0.04 }, true, true);
  assert.equal(stepped?.foot, 1);
  assert.ok(Math.abs((stepped?.local ?? 1) - 0.04) < 1e-9);
  const done = stepNorthPlant(stepped, { x: origin.x, y: origin.y - 0.04 }, moved, true, true);
  assert.equal(done?.foot, 0);
  assert.ok(Math.abs(done?.local ?? 1) < 1e-6);
});

test("a north stop freezes the plant and a side step drops it", () => {
  const plant = stepNorthPlant(null, { x: 5, y: 4 }, { x: 5, y: 3.9 }, true, true);
  assert.equal(stepNorthPlant(plant, { x: 5, y: 3.9 }, { x: 5, y: 3.9 }, false, true), plant);
  assert.equal(stepNorthPlant(plant, { x: 5, y: 3.9 }, { x: 5.1, y: 3.8 }, true, true), null);
  const entry = northPose(1, 0.02);
  assert.deepEqual(
    entry.boots.map((boot) => boot.sole.y),
    [...entry.boots.map((boot) => boot.sole.y)].sort((a, b) => a - b),
  );
  assert.equal(entry.response, null);
  assert.equal(northPose(1, 0.2).response, "n-response-N1.png");
});
