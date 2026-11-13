import assert from "node:assert/strict";
import { test } from "node:test";
import { WALL_RAISE_SCALE } from "./walk-sheets";
import {
  TPS_BACK,
  TPS_EYE_HEIGHT,
  TPS_FOV_Y_DEG,
  TPS_LOOK_HEIGHT,
  TPS_VIEW_ASPECT,
  cameraBack,
  fitBillboard,
  letterbox,
  makeTpsCamera,
  projectGround,
  projectTps,
} from "./tps-camera";

test("the shipped camera is a third-person hall view, not an overhead map", () => {
  assert.ok(TPS_BACK >= 1.2 && TPS_BACK <= 1.8);
  assert.ok(TPS_EYE_HEIGHT >= 0.9 && TPS_EYE_HEIGHT <= 1.2);
  assert.ok(TPS_EYE_HEIGHT < WALL_RAISE_SCALE);
  assert.ok(TPS_LOOK_HEIGHT > 0.4 && TPS_LOOK_HEIGHT < 1);
  assert.ok(TPS_FOV_Y_DEG >= 50 && TPS_FOV_Y_DEG <= 55);
  assert.ok(TPS_VIEW_ASPECT < 1.2);
  const view = letterbox(1231, 369);
  assert.ok(view.w / view.h < 1.2);
  assert.ok(view.w < 1231 * 0.6);
});

test("the eye stays behind the body and the whole hunter projects inside the picture", () => {
  for (const cardinal of ["E", "W", "S", "N"] as const) {
    const cam = makeTpsCamera(5, 4, cardinal, 1231, 369, TPS_BACK);
    const dir = cardinal === "E" ? 1 : cardinal === "W" ? -1 : 0;
    const zdir = cardinal === "S" ? 1 : cardinal === "N" ? -1 : 0;
    assert.ok(Math.abs(cam.eye.x - (5 - dir * TPS_BACK)) < 1e-9);
    assert.ok(Math.abs(cam.eye.z - (4 - zdir * TPS_BACK)) < 1e-9);
    assert.equal(cam.eye.y, TPS_EYE_HEIGHT);
    const feet = projectGround(5, 4, cam);
    const head = projectTps(5, 1.2, 4, cam);
    assert.ok(feet && head);
    const box = cam.view;
    for (const p of [feet!, head!]) {
      assert.ok(p.x > box.x + 4 && p.x < box.x + box.w - 4);
      assert.ok(p.y > box.y + 4 && p.y < box.y + box.h - 4);
    }
    assert.ok(head!.y < feet!.y);
  }
});

test("a close camera still keeps the whole body inside the picture", () => {
  const view = { x: 0, y: 0, w: 280, h: 369 };
  const fitted = fitBillboard({ x: 140, y: 700 }, { x: 140, y: -40 }, view, 8, 40 / 600);
  assert.ok(fitted.y + fitted.h * (40 / 600) <= view.h - 8);
  assert.ok(fitted.y - fitted.h >= 8);
  const open = fitBillboard({ x: 140, y: 320 }, { x: 140, y: 80 }, view);
  assert.equal(open.y, 320);
  assert.equal(open.h, 240);
});

test("a wall behind the hunter shortens the follow instead of sitting inside the wall", () => {
  const back = cameraBack(1.5, 1.5, "E", (x) => x < 1.05);
  assert.ok(back < TPS_BACK);
  assert.ok(back >= 0.4);
  const eye = 1.5 - back;
  assert.ok(eye >= 1.05);
});
