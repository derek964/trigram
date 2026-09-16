import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LEVELS,
  showsFingerCue,
  showsJunctionChevron,
  showsPathPreview,
  showsTeachingArrows,
  usesHardVisionMask,
  usesVisionDisc,
  usesWallSilhouette,
  visionFog,
} from "./levels";

test("L1 is full-bright with teaching finger + path preview, no chevron", () => {
  assert.equal(visionFog(1), "none");
  assert.equal(usesVisionDisc(1), false);
  assert.equal(usesWallSilhouette(1), false);
  assert.equal(usesHardVisionMask(1), false);
  assert.equal(showsFingerCue(1), true);
  assert.equal(showsJunctionChevron(1), false);
  assert.equal(showsPathPreview(1), true);
  assert.equal(showsTeachingArrows(1), true);
});

test("L2 keeps soft fog, wall silhouette, junction chevron, and path preview", () => {
  assert.equal(visionFog(2), "soft-silhouette");
  assert.equal(usesVisionDisc(2), true);
  assert.equal(usesWallSilhouette(2), true);
  assert.equal(usesHardVisionMask(2), false);
  assert.equal(showsFingerCue(2), false);
  assert.equal(showsJunctionChevron(2), true);
  assert.equal(showsPathPreview(2), true);
  assert.equal(showsTeachingArrows(2), true);
});

test("L3+ is hard circular FOV with no teaching arrows", () => {
  for (const cfg of LEVELS.filter((l) => l.id >= 3)) {
    assert.equal(visionFog(cfg.id), "hard-black", `L${cfg.id} fog`);
    assert.equal(usesVisionDisc(cfg.id), true, `L${cfg.id} still has a disc`);
    assert.equal(usesWallSilhouette(cfg.id), false, `L${cfg.id} must not silhouette walls`);
    assert.equal(usesHardVisionMask(cfg.id), true, `L${cfg.id} hard black outside disc`);
    assert.equal(showsFingerCue(cfg.id), false, `L${cfg.id} no finger`);
    assert.equal(showsJunctionChevron(cfg.id), false, `L${cfg.id} no junction chevron`);
    assert.equal(showsPathPreview(cfg.id), false, `L${cfg.id} no path-preview ribbon`);
    assert.equal(showsTeachingArrows(cfg.id), false, `L${cfg.id} no 箭头`);
  }
});

test("L3–5 used to keep junction chevrons; they must not anymore", () => {
  for (const id of [3, 4, 5]) {
    assert.equal(showsJunctionChevron(id), false, `L${id} chevron drip removed`);
  }
});
