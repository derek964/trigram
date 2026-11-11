import assert from "node:assert/strict";
import { test } from "node:test";
import { PLANT_DISTANCE, artToWorld, worldToArt } from "./east-plant";
import { NSW_MEASURED_STEP, WALK_CYCLE_DISTANCE } from "./motion";
import {
  SOUTH_PLANT_DISTANCE,
  SOUTH_UPPER,
  SOUTH_UPPER_S1,
  SOUTH_UPPER_S3,
  southIdlePose,
  southLatch,
  southLayers,
  southPose,
  stepSouthPlant,
} from "./south-plant";

test("south same-foot travel holds world x and is not the east plant", () => {
  const s0 = artToWorld({ x: 193.5, y: 601 });
  const s1 = artToWorld({ x: 257.5, y: 569 });
  const s2 = artToWorld({ x: 254.5, y: 631 });
  const s3 = artToWorld({ x: 318.5, y: 599 });
  assert.ok(Math.abs(s1.x - s0.x) < 1e-9);
  assert.ok(Math.abs(s0.y - s1.y - 0.256) < 1e-9);
  assert.ok(Math.abs(s3.x - s2.x) < 1e-9);
  assert.ok(Math.abs(s2.y - s3.y - 0.256) < 1e-9);
  assert.equal(SOUTH_PLANT_DISTANCE, NSW_MEASURED_STEP);
  assert.equal(NSW_MEASURED_STEP * 4, WALK_CYCLE_DISTANCE);
  assert.notEqual(SOUTH_PLANT_DISTANCE, PLANT_DISTANCE);
});

test("moving due south keeps the S0 support sole on one world latch", () => {
  const origin = { x: 2.5, y: 1.5 };
  const latch = southLatch(origin, 0);
  const moved = { x: origin.x, y: origin.y + SOUTH_PLANT_DISTANCE };
  const trailing = artToWorld(southPose(0, SOUTH_PLANT_DISTANCE).boots.find((boot) => boot.role === "support")!.sole);
  assert.ok(Math.abs(moved.x + trailing.x - latch.x) < 1e-9);
  assert.ok(Math.abs(moved.y + trailing.y - latch.y) < 1e-9);
  const stepped = stepSouthPlant(null, origin, { x: origin.x, y: origin.y + 0.04 }, true, true);
  assert.equal(stepped?.foot, 0);
  assert.ok(Math.abs((stepped?.local ?? 1) - 0.04) < 1e-9);
  const done = stepSouthPlant(stepped, { x: origin.x, y: origin.y + 0.04 }, moved, true, true);
  assert.equal(done?.foot, 1);
  assert.ok(Math.abs(done?.local ?? 1) < 1e-6);
  assert.equal(done?.originX, origin.x);
});

test("a small south local is a swing plus one support, and a stop freezes it", () => {
  const entry = southPose(0, 0.02);
  assert.equal(entry.id, "S0");
  assert.equal(entry.response, null);
  assert.equal(entry.spear, "shared-s-spear.png");
  assert.deepEqual(
    entry.boots.map((boot) => boot.role),
    ["swing", "support"],
  );
  assert.equal(entry.boots.filter((boot) => boot.latched).length, 1);
  const plant = stepSouthPlant(null, { x: 2.5, y: 1.5 }, { x: 2.5, y: 1.54 }, true, true);
  assert.equal(stepSouthPlant(plant, { x: 2.5, y: 1.54 }, { x: 2.5, y: 1.54 }, false, true), plant);
  assert.equal(stepSouthPlant(plant, { x: 2.5, y: 1.54 }, { x: 2.6, y: 1.7 }, true, true), null);
  const trailing = southPose(0, 0.2);
  assert.equal(trailing.id, "S1");
  assert.equal(trailing.response, "s-response-S1.png");
  assert.equal(trailing.spear, "s-spear-S1.png");
  assert.equal(southPose(1, 0.2).response, "s-response-S3.png");
  assert.equal(southPose(1, 0.2).spear, "s-spear-S3.png");
});

test("south plates draw boots, cuff, upper, response, then the front spear", () => {
  const early = southLayers(southPose(0, 0.02)).map((layer) => (layer.kind === "boot" ? layer.boot.role : layer.role));
  assert.deepEqual(early, ["swing", "support", "trousers", "upper", "spear"]);
  const late = southLayers(southPose(0, 0.2));
  assert.deepEqual(
    late.map((layer) => (layer.kind === "boot" ? layer.boot.file : layer.file)),
    [
      "boot-foot0-S1.png",
      "boot-foot1-S1-swing.png",
      "trousers-S1.png",
      SOUTH_UPPER_S1,
      "s-response-S1.png",
      "s-spear-S1.png",
    ],
  );
  assert.equal(late.some((layer) => layer.kind === "root" && layer.file === SOUTH_UPPER), false);
  assert.equal(southLayers(southPose(1, 0.2)).some((layer) => layer.kind === "root" && layer.file === SOUTH_UPPER_S3), true);
  assert.equal(southLayers(southPose(0, 0.02)).some((layer) => layer.kind === "root" && layer.file === SOUTH_UPPER), true);
  assert.equal(late.some((layer) => layer.kind === "root" && layer.file.includes("shaft")), false);
  const stand = southIdlePose();
  assert.equal(stand.boots.some((boot) => boot.latched), false);
  assert.deepEqual(
    southLayers(stand).map((layer) => (layer.kind === "root" ? layer.role : layer.boot.role)),
    ["stand", "stand", "trousers", "upper", "spear"],
  );
});

test("a south latch shifts the boot in billboard art, not by a floor projection", () => {
  const origin = { x: 1.5, y: 2.524 };
  const latch = southLatch(origin, 0);
  const gap = (local: number) => {
    const root = { x: origin.x, y: origin.y + local };
    const sole = southPose(0, local).boots.find((boot) => boot.role === "support")!;
    const art = worldToArt({ x: latch.x - root.x, y: latch.y - root.y });
    return { dx: art.x - sole.sole.x, dy: art.y - sole.sole.y };
  };
  const mid = gap(0.128);
  assert.ok(Math.abs(Math.hypot(mid.dx, mid.dy) - 35.78) < 0.05);
  const late = gap(0.24);
  assert.ok(Math.abs(Math.hypot(late.dx, late.dy) - 4.47) < 0.05);
  const measured = gap(0.2184);
  assert.ok(Math.abs(measured.dx - -9.4) < 0.15);
  assert.ok(Math.abs(measured.dy - 4.7) < 0.15);
});
