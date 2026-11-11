import assert from "node:assert/strict";
import { test } from "node:test";
import { PLANT_DISTANCE, artToWorld } from "./east-plant";
import { NSW_MEASURED_STEP, WALK_CYCLE_DISTANCE } from "./motion";
import {
  WEST_IDLE_FOOT1_PLATE_SOLE,
  WEST_PLANT_DISTANCE,
  WEST_SHAFT,
  WEST_UPPER,
  WEST_UPPER_W1,
  westIdlePose,
  westLatch,
  westLayers,
  westPose,
  stepWestPlant,
} from "./west-plant";

test("west same-foot travel holds world y and is not the east plant", () => {
  const w0 = artToWorld({ x: 212.5, y: 590 });
  const w1 = artToWorld({ x: 276.5, y: 622 });
  const w2 = artToWorld({ x: 236.5, y: 578 });
  const w3 = artToWorld({ x: 300.5, y: 610 });
  assert.ok(Math.abs(w1.y - w0.y) < 1e-9);
  assert.ok(Math.abs(w1.x - w0.x - 0.256) < 1e-9);
  assert.ok(Math.abs(w3.y - w2.y) < 1e-9);
  assert.ok(Math.abs(w3.x - w2.x - 0.256) < 1e-9);
  assert.equal(WEST_PLANT_DISTANCE, NSW_MEASURED_STEP);
  assert.equal(NSW_MEASURED_STEP * 4, WALK_CYCLE_DISTANCE);
  assert.notEqual(WEST_PLANT_DISTANCE, PLANT_DISTANCE);
});

test("moving due west keeps the W0 support sole on one world latch", () => {
  const origin = { x: 2.4, y: 1.5 };
  const latch = westLatch(origin, 0);
  const moved = { x: origin.x - WEST_PLANT_DISTANCE, y: origin.y };
  const trailing = artToWorld(westPose(0, WEST_PLANT_DISTANCE).boots.find((boot) => boot.role === "support")!.sole);
  assert.ok(Math.abs(moved.x + trailing.x - latch.x) < 1e-9);
  assert.ok(Math.abs(moved.y + trailing.y - latch.y) < 1e-9);
  const stepped = stepWestPlant(null, origin, { x: origin.x - 0.04, y: origin.y }, true, true);
  assert.equal(stepped?.foot, 0);
  assert.equal(stepped?.originY, origin.y);
  assert.ok(Math.abs((stepped?.local ?? 1) - 0.04) < 1e-9);
  const done = stepWestPlant(stepped, { x: origin.x - 0.04, y: origin.y }, moved, true, true);
  assert.equal(done?.foot, 1);
  assert.equal(done?.originY, origin.y);
  assert.ok(Math.abs(done?.local ?? 1) < 1e-6);
});

test("a small west local is a swing plus one support, and a stop freezes it", () => {
  const entry = westPose(0, 0.02);
  assert.equal(entry.id, "W0");
  assert.equal(entry.response, null);
  assert.equal(entry.upper, WEST_UPPER);
  assert.equal(entry.boots.filter((boot) => boot.latched).length, 1);
  const plant = stepWestPlant(null, { x: 2.4, y: 1.5 }, { x: 2.36, y: 1.5 }, true, true);
  assert.equal(stepWestPlant(plant, { x: 2.36, y: 1.5 }, { x: 2.36, y: 1.5 }, false, true), plant);
  assert.equal(stepWestPlant(plant, { x: 2.36, y: 1.5 }, { x: 2.2, y: 1.7 }, true, true), null);
  const trailing = westPose(0, 0.2);
  assert.equal(trailing.id, "W1");
  assert.equal(trailing.upper, WEST_UPPER_W1);
  assert.equal(trailing.response, "w-response-W1.png");
  assert.equal(westPose(1, 0.2).response, "w-response-W3.png");
});

test("west plates draw the rear shaft, then the cleared upper, then the response, then the spear", () => {
  const late = westLayers(westPose(0, 0.2));
  assert.deepEqual(
    late.map((layer) => (layer.kind === "boot" ? layer.boot.file : layer.file)),
    [
      WEST_SHAFT,
      "boot-foot1-W1-swing.png",
      "boot-foot0-W1.png",
      "trousers-W1.png",
      WEST_UPPER_W1,
      "w-response-W1.png",
      "w-spear-W1.png",
    ],
  );
  assert.equal(late.some((layer) => layer.kind === "root" && layer.file === WEST_UPPER), false);
  const stand = westIdlePose();
  assert.equal(stand.boots.every((boot) => boot.latched === false), true);
  const foot1 = stand.boots.find((boot) => boot.foot === 1);
  assert.deepEqual(foot1?.sole, WEST_IDLE_FOOT1_PLATE_SOLE);
  const idleLock = artToWorld(WEST_IDLE_FOOT1_PLATE_SOLE);
  const walkLock = artToWorld(westPose(0, 0).boots.find((boot) => boot.role === "support")!.sole);
  assert.ok(Math.hypot(idleLock.x - walkLock.x, idleLock.y - walkLock.y) > 0.05);
});
