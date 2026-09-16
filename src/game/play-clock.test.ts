import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVELS } from "./levels";
import {
  countdownUrgent,
  failKicker,
  failReasonCopy,
  formatCountdown,
  hardTimeLimitSec,
  playClockFrozen,
  remainingTimeSec,
  shouldTimeFail,
  stepPlayClock,
  TUTORIAL_BAND_MAX,
} from "./play-clock";

test("early tutorial levels have no hard time fail", () => {
  for (let id = 1; id <= 3; id++) {
    assert.equal(hardTimeLimitSec(id), null, `L${id} must not carry a hard timeout`);
    assert.equal(shouldTimeFail(id, 999), false);
    assert.equal(LEVELS[id - 1]!.timeLimit, 0);
  }
  assert.equal(TUTORIAL_BAND_MAX, 5);
  for (let id = 1; id <= TUTORIAL_BAND_MAX; id++) {
    assert.equal(shouldTimeFail(id, 50), false, `L${id} still failed at the old 50s mark`);
    assert.equal(shouldTimeFail(id, 62), false, `L${id} still failed at the old 62s mark`);
  }
});

test("later levels countdown remaining MM:SS and fail with hops left", () => {
  const limit = hardTimeLimitSec(6);
  assert.ok(limit && limit >= 90);
  assert.equal(formatCountdown(50), "00:50");
  assert.equal(formatCountdown(62), "01:02");
  assert.equal(formatCountdown(9.2), "00:10");
  assert.equal(remainingTimeSec(40, 50), 10);
  assert.equal(countdownUrgent(10), true);
  assert.equal(countdownUrgent(10.01), false);
  assert.equal(shouldTimeFail(6, limit - 0.01), false);
  assert.equal(shouldTimeFail(6, limit), true);
  assert.equal(failKicker("timeout"), "时间到了");
  assert.equal(failReasonCopy("timeout", 4), "时间到了，还差4格。");
  assert.equal(failReasonCopy("thief"), "被偷宠贼拦住了。");
});

test("play clock pauses during tips, pause menu, and ads", () => {
  assert.equal(playClockFrozen({ tipOpen: true, pauseOpen: false, adOpen: false }), true);
  assert.equal(playClockFrozen({ tipOpen: false, pauseOpen: true, adOpen: false }), true);
  assert.equal(playClockFrozen({ tipOpen: false, pauseOpen: false, adOpen: true }), true);
  assert.equal(playClockFrozen({ tipOpen: false, pauseOpen: false, adOpen: false }), false);
  assert.equal(stepPlayClock(12, 0.5, true), 12);
  assert.equal(stepPlayClock(12, 0.5, false), 12.5);
});
