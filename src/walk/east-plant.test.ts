import assert from "node:assert/strict";
import { test } from "node:test";
import { NSW_MEASURED_STEP, WALK_CYCLE_DISTANCE } from "./motion";
import { WALL_RAISE_SCALE } from "./walk-sheets";
import {
  ENTRY_SOLE_Y_GAP,
  PLANT_ART_DELTA_X,
  PLANT_ART_DELTA_Y,
  PLANT_CYCLE,
  PLANT_DISTANCE,
  artToWorld,
  billboardBoot,
  latchWorld,
  eastHudToken,
  poseFor,
  stepEastPlant,
  worldToArt,
} from "./east-plant";

test("eastline soles are a pure-east plant, not the 1.024 cycle", () => {
  const entry0 = artToWorld({ x: 314.5, y: 625 });
  const trail0 = artToWorld({ x: 204.5, y: 570 });
  const entry1 = artToWorld({ x: 315.5, y: 625 });
  const trail1 = artToWorld({ x: 205.5, y: 570 });
  for (const [entry, trail] of [
    [entry0, trail0],
    [entry1, trail1],
  ] as const) {
    assert.ok(Math.abs(trail.x - entry.x - -0.44) < 1e-9);
    assert.ok(Math.abs(trail.y - entry.y) < 1e-9);
  }
  assert.equal(PLANT_ART_DELTA_X, -110);
  assert.equal(PLANT_ART_DELTA_Y, -55);
  assert.equal(PLANT_DISTANCE, 0.44);
  assert.equal(PLANT_CYCLE, 0.88);
  assert.equal(WALK_CYCLE_DISTANCE, 1.024);
  assert.equal(NSW_MEASURED_STEP * 4, WALK_CYCLE_DISTANCE);
  assert.notEqual(NSW_MEASURED_STEP * 4, PLANT_CYCLE);
  assert.equal(WALL_RAISE_SCALE, 1.75);
});

test("entry soles in one frame stay 55 art pixels apart in y", () => {
  const entry = poseFor(0, 0);
  const ys = entry.boots.map((boot) => boot.sole.y);
  assert.equal(Math.abs(ys[0]! - ys[1]!), ENTRY_SOLE_Y_GAP);
  assert.deepEqual(
    entry.boots.map((boot) => boot.sole.y),
    [...entry.boots.map((boot) => boot.sole.y)].sort((a, b) => a - b),
  );
});

test("a pure-east root keeps the support sole on one world latch", () => {
  const origin = { x: 2, y: 3 };
  const latch = latchWorld(origin, 0, "support");
  const moved = { x: origin.x + PLANT_DISTANCE, y: origin.y };
  const trailing = artToWorld(poseFor(0, PLANT_DISTANCE).boots.find((boot) => boot.role === "support")!.sole);
  assert.ok(Math.abs(moved.x + trailing.x - latch.x) < 1e-9);
  assert.ok(Math.abs(moved.y + trailing.y - latch.y) < 1e-9);
  const stepped = stepEastPlant(null, origin, { x: origin.x + 0.2, y: origin.y }, true, true);
  assert.equal(stepped?.originY, origin.y);
  assert.ok(Math.abs((stepped?.local ?? 0) - 0.2) < 1e-9);
  const done = stepEastPlant(stepped, { x: origin.x + 0.2, y: origin.y }, moved, true, true);
  assert.equal(done?.foot, 1);
  assert.ok(Math.abs(done?.local ?? 1) < 1e-9);
});

test("east mid-hold is the half of the 0.440 plant, not the 0.256 window", () => {
  assert.equal(poseFor(0, 0.05).id, "source0-entry");
  assert.equal(poseFor(0, 0.22).id, "E0-mid");
  assert.equal(poseFor(0, 0.4).id, "E0-0.4125");
  assert.equal(poseFor(1, 0.22).id, "E1-mid");
  assert.equal(poseFor(0, 0.11).id, "E0-0.110");
  assert.equal(poseFor(0, 0.33).id, "E0-0.330");
  assert.equal(poseFor(1, 0.11).id, "E1-0.110");
  assert.equal(poseFor(1, 0.33).id, "E1-0.330");
  assert.equal(poseFor(0, 0.054).id, "source0-entry");
  assert.equal(poseFor(0, 0.384).id, "E0-0.330");
  assert.equal(poseFor(0, 0.385).id, "E0-0.385");
  assert.equal(poseFor(0, 0.399).id, "E0-0.385");
  assert.equal(poseFor(0, 0.4125).id, "E0-0.4125");
  assert.equal(poseFor(0, 0.425).id, "source0-trailing");
  assert.equal(poseFor(1, 0.385).id, "E1-0.385");
  assert.equal(poseFor(1, 0.4125).id, "E1-0.4125");
  assert.equal(poseFor(1, 0.425).id, "source1-trailing");
  assert.equal(eastHudToken(0, 0.11), "E0110.11");
  assert.equal(eastHudToken(0, 0.22), "E010.22");
  assert.equal(eastHudToken(0, 0.33), "E0330.33");
  assert.equal(eastHudToken(0, 0.385), "E0380.39");
  assert.equal(eastHudToken(0, 0.4125), "E0410.41");
  assert.equal(eastHudToken(1, 0.11), "E1110.11");
  assert.equal(eastHudToken(1, 0.22), "E10.22");
  assert.equal(eastHudToken(1, 0.33), "E1330.33");
  assert.equal(eastHudToken(1, 0.385), "E1380.39");
  assert.equal(eastHudToken(1, 0.4125), "E1410.41");
  assert.deepEqual(poseFor(0, 0.11).boots.find((boot) => boot.role === "support")?.sole, { x: 286.5, y: 611 });
  assert.deepEqual(poseFor(1, 0.33).boots.find((boot) => boot.role === "support")?.sole, { x: 232.5, y: 584 });
  assert.deepEqual(poseFor(0, 0.385).boots.find((boot) => boot.role === "support")?.sole, { x: 218.5, y: 577 });
  assert.deepEqual(poseFor(1, 0.385).boots.find((boot) => boot.role === "support")?.sole, { x: 219.5, y: 577 });
  assert.deepEqual(poseFor(0, 0.4125).boots.find((boot) => boot.role === "support")?.sole, { x: 211.5, y: 574 });
  assert.deepEqual(poseFor(1, 0.4125).boots.find((boot) => boot.role === "support")?.sole, { x: 212.5, y: 574 });
  assert.deepEqual(poseFor(0, 0.385).boots.find((boot) => boot.role === "swing")?.sole, { x: 319, y: 547 });
  assert.deepEqual(poseFor(0, 0.4125).boots.find((boot) => boot.role === "swing")?.sole, { x: 327, y: 545 });
  const origin = { x: 3, y: 1.5 };
  const latch = latchWorld(origin, 0, "support");
  const root = { x: origin.x + 0.22, y: origin.y };
  const sole = poseFor(0, 0.22).boots.find((boot) => boot.role === "support")!;
  const art = worldToArt({ x: latch.x - root.x, y: latch.y - root.y });
  assert.ok(Math.hypot(art.x - sole.sole.x, art.y - sole.sole.y) < 1);
  assert.equal(sole.sole.y, 597);
  assert.equal(poseFor(0, 0.22).boots.find((boot) => boot.role === "swing")?.latched, false);
});

test("a stop freezes the plant and a diagonal or turn drops it", () => {
  const plant = stepEastPlant(null, { x: 1, y: 2 }, { x: 1.1, y: 2 }, true, true);
  assert.equal(stepEastPlant(plant, { x: 1.1, y: 2 }, { x: 1.1, y: 2 }, false, true), plant);
  assert.equal(stepEastPlant(plant, { x: 1.1, y: 2 }, { x: 1.2, y: 2.05 }, true, true), null);
  assert.equal(stepEastPlant(plant, { x: 1.1, y: 2 }, { x: 1.1, y: 2.2 }, true, false), null);
});

test("world art round trip, and a matching latch draws the boot on the root plate", () => {
  const sole = { x: 193.5, y: 601 };
  const back = worldToArt(artToWorld(sole));
  assert.ok(Math.abs(back.x - sole.x) < 1e-9);
  assert.ok(Math.abs(back.y - sole.y) < 1e-9);
  const root = { x: 1.5, y: 3.2 };
  const latch = { x: root.x + artToWorld(sole).x, y: root.y + artToWorld(sole).y };
  const placed = billboardBoot(root, latch, sole, 400, 500, 0.4);
  assert.ok(Math.abs(placed.drawX - (400 - 256 * 0.4)) < 1e-9);
  assert.ok(Math.abs(placed.drawY - (500 - 600 * 0.4)) < 1e-9);
  assert.ok(Math.abs(placed.sole.x - placed.rootSole.x) < 1e-9);
  assert.ok(Math.abs(placed.sole.y - placed.rootSole.y) < 1e-9);
});
