import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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

test("the six approved C plates are RGBA and the original entry files are unchanged", () => {
  const plates: Record<string, string> = {
    "E0-C1-refined-static-transition.png": "33d74c07f7229dd1e1233745268116212a242bb2ce36d2e73ec88ad577223591",
    "E0-C2-refined-static-transition.png": "37d30d235684c4672b4db95b6bc4f2bb6ba686c64a695a5474121e4ec3070c9a",
    "E0-C3-refined-static-transition.png": "6a8cc08aa7c7c2c7853047abe9f9a234f6b66fc2367f5ca459f4225e94831843",
    "E1-C1-refined-static-transition.png": "b4646919d5f1b19374f654e235f7d41020b2ce0a446ffb722639e19438788ca0",
    "E1-C2-refined-static-transition.png": "e0c1785b11af5e4e06c351fb5937a1a42370b6925c38dd1d04625aff4f69bfbb",
    "E1-C3-refined-static-transition.png": "db5e343872917767a4bf8beb2524b3a8f9535217fb81e8b42e2eadfafa268f26",
  };
  for (const [name, hash] of Object.entries(plates)) {
    const buf = readFileSync(new URL(`../../public/art/eastline/c-refined-20261116/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(buf).digest("hex"), hash);
    assert.equal(buf.readUInt32BE(16), 512);
    assert.equal(buf.readUInt32BE(20), 640);
    assert.equal(buf[24], 8);
    assert.equal(buf[25], 6);
  }
  const originals: Record<string, string> = {
    "boot-foot0-entry.png": "7dd649976cbceac99b377fbe2074b8ec7c85717b34068e0ac2fe5ab24281d50c",
    "boot-foot1-entry.png": "e6844a0f6dbe0bf789c10490b1a3eed5d746a354d8cb7c0c0a0c1fe75ab59854",
    "east-source0-entry-trousers.png": "15183fe592e38ebd90f9f72016e0e553763a1965e3fd5cd9bb2e72f5d3ea7965",
    "east-source1-entry-trousers.png": "d513176c9ce5d7d839c9b787f3a20b6c4c21f25bf224ee6e9f740204c58a4ebb",
    "boot-foot0-trailing.png": "38edd16a166cc091a1524fbd8953c7c30b756cc63797cd4828ef8d55bcbcdad7",
    "boot-foot1-trailing.png": "7391aaefcb5726174ae61e4a87b155e6df944f2d52d866be814575cf13df0758",
    "east-source0-trailing-trousers.png": "e7bf7a73bc4a4ec6e42ac7787810d4a3573e8409e7dd806a53929a6ef1f071eb",
    "east-source1-trailing-trousers.png": "189b215b73b44b1f8ec3d4db772d1cb1ab200edd846590f8fb92041954ca54b9",
  };
  for (const [name, hash] of Object.entries(originals)) {
    const buf = readFileSync(new URL(`../../public/art/eastline/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(buf).digest("hex"), hash);
  }
});

test("approved C plates stay inside the existing entry interval", () => {
  assert.equal(poseFor(0, 0).id, "source0-entry");
  assert.equal(poseFor(0, 0.01).id, "E0-C1");
  assert.equal(poseFor(0, 1 / 60).id, "E0-C2");
  assert.equal(poseFor(0, 0.02).id, "E0-C2");
  assert.equal(poseFor(0, 2 / 60).id, "E0-C3");
  assert.equal(poseFor(0, 0.042).id, "E0-C3");
  assert.equal(poseFor(0, 0.0499).id, "E0-C3");
  assert.equal(poseFor(1, 0.01).id, "E1-C1");
  assert.equal(poseFor(1, 0.02).id, "E1-C2");
  assert.equal(poseFor(1, 0.042).id, "E1-C3");
  assert.equal(poseFor(0, 0.05).composite, undefined);
  assert.equal(poseFor(0, 0.01).composite, "c-refined-20261116/E0-C1-refined-static-transition.png");
  assert.equal(poseFor(0, 0.055).id, "E0-0.110");
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
