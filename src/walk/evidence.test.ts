import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { poseFor } from "./east-plant";
import { createWalker, stepWalker } from "./motion";
import {
  DRAW_ID_BITS,
  EVIDENCE_FIDUCIALS,
  FIDUCIAL_UP,
  assembleEvidenceRow,
  classifyFiducial,
  decodeDrawId,
  drawIdPattern,
  evidenceEnabled,
} from "./evidence";

test("evidence mode is opt-in and the module does not step the walker", () => {
  assert.equal(evidenceEnabled(""), false);
  assert.equal(evidenceEnabled("?settle=1"), false);
  assert.equal(evidenceEnabled("?evidence=1"), true);
  const src = readFileSync(new URL("./evidence.ts", import.meta.url), "utf8");
  assert.equal(src.includes("stepWalker"), false);
  assert.equal(src.includes("stepEastPlant"), false);
});

test("a draw id painted as bits decodes to that same row", () => {
  for (const id of [1, 42, 1000, (1 << DRAW_ID_BITS) - 1]) {
    const bits = drawIdPattern(id);
    assert.equal(decodeDrawId(bits), id);
    const row = assembleEvidenceRow(id, {
      input: ["e"],
      root: { x: 2.5, y: 1.5 },
      phase: 1.25,
      moving: true,
      facing: "E",
      blocked: false,
      plantFrozen: false,
      hudAtDraw: "走",
      eastPlant: { originX: 2.82, originY: 1.5, foot: 1, local: 0.11 },
      eastDrawn: {
        poseId: "E1-0.110",
        boots: [
          {
            role: "support",
            foot: 1,
            latched: true,
            soleArt: { x: 288.5, y: 611 },
            latchWorld: { x: 3.039, y: 1.481 },
            projectedSole: { x: 10, y: 20 },
            projectedDeltaPx: 0,
            projectedArtDelta: 0.5,
          },
        ],
      },
      camera: {
        back: 1.7,
        eye: { x: 0, y: 1.05, z: 0 },
        look: { x: 1, y: 0.68, z: 0 },
        forward: { x: 1, y: 0, z: 0 },
        right: { x: 0, y: 0, z: 1 },
        up: { x: 0, y: 1, z: 0 },
        fovY: 0.9,
        aspect: 0.8,
        view: { x: 0, y: 0, w: 10, h: 10 },
      },
      fiducials: [{
        id: "A1",
        world: { x: 1.85, y: 0.012, z: 1.32 },
        predictedProjection: { x: 4, y: 5 },
        measuredPixels: null,
        visibility: "in-view",
      }],
    });
    assert.equal(row.drawId, decodeDrawId(drawIdPattern(row.drawId)));
    assert.equal(row.eastDrawn?.poseId, "E1-0.110");
    assert.equal(row.projectedNotPixel, true);
  }
  assert.equal(decodeDrawId([false, false, false]), null);
});

test("recording a draw does not change the walker, and a real step can skip 0.385", () => {
  let walker = createWalker();
  const before = JSON.stringify(walker);
  assembleEvidenceRow(1, {
    input: [],
    root: { x: walker.x, y: walker.y },
    phase: walker.phase,
    moving: walker.moving,
    facing: "E",
    blocked: false,
    plantFrozen: false,
    hudAtDraw: "",
    eastPlant: null,
    eastDrawn: null,
    camera: {
      back: 1.7,
      eye: { x: 0, y: 0, z: 0 },
      look: { x: 0, y: 0, z: 0 },
      forward: { x: 1, y: 0, z: 0 },
      right: { x: 0, y: 0, z: 1 },
      up: { x: 0, y: 1, z: 0 },
      fovY: 0.9,
      aspect: 0.8,
      view: { x: 0, y: 0, w: 1, h: 1 },
    },
    fiducials: [],
  });
  assert.equal(JSON.stringify(walker), before);
  const stick = { x: 1, y: 0 };
  let plain = createWalker();
  let logged = createWalker();
  for (let i = 0; i < 8; i++) {
    plain = stepWalker(plain, stick, 1 / 60);
    logged = stepWalker(logged, stick, 1 / 60);
    assembleEvidenceRow(i + 1, {
      input: ["e"],
      root: { x: logged.x, y: logged.y },
      phase: logged.phase,
      moving: logged.moving,
      facing: "E",
      blocked: false,
      plantFrozen: false,
      hudAtDraw: "",
      eastPlant: null,
      eastDrawn: null,
      camera: {
        back: 1.7,
        eye: { x: 0, y: 0, z: 0 },
        look: { x: 0, y: 0, z: 0 },
        forward: { x: 1, y: 0, z: 0 },
        right: { x: 0, y: 0, z: 1 },
        up: { x: 0, y: 1, z: 0 },
        fovY: 0.9,
        aspect: 0.8,
        view: { x: 0, y: 0, w: 1, h: 1 },
      },
      fiducials: [],
    });
  }
  assert.deepEqual(logged, plain);
  const from = 0.37;
  const step = 2.55 / 60;
  assert.equal(poseFor(0, from).id, "E0-0.330");
  assert.equal(poseFor(0, from + step).id, "E0-0.4125");
  assert.equal(poseFor(0, 0.39).id, "E0-0.385");
  assert.equal(classifyFiducial(null, { x: 0, y: 0, w: 10, h: 10 }, false), "behind-camera");
  assert.equal(classifyFiducial({ x: 20, y: 5 }, { x: 0, y: 0, w: 10, h: 10 }, false), "offscreen");
  assert.equal(classifyFiducial({ x: 5, y: 5 }, { x: 0, y: 0, w: 10, h: 10 }, true), "occluded");
  assert.ok(EVIDENCE_FIDUCIALS.length >= 8);
  for (const mark of EVIDENCE_FIDUCIALS) assert.ok(Math.abs(mark.z - 1.5) >= 0.1);
  assert.equal(FIDUCIAL_UP, 0.012);
});
