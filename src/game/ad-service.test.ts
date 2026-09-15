import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adRequests,
  createRewardedVideoAd,
  resetAdService,
  setAdMock,
  shouldRequestInterstitial,
  showInterstitial,
  showRewardedVideo,
} from "./ad-service";
import { INTERSTITIAL_LEVELS } from "./ad-config";
import { emitClear, resetAdBus, reviveOnDeath } from "./ads";

test("L1–9 never request interstitial; chapter beats do", () => {
  resetAdService();
  for (let id = 1; id <= 9; id++) {
    assert.equal(shouldRequestInterstitial(id), false, `L${id} must not interstitial`);
  }
  for (const id of INTERSTITIAL_LEVELS) {
    assert.equal(shouldRequestInterstitial(id), true, `L${id} is a chapter-beat interstitial`);
  }
  assert.equal(shouldRequestInterstitial(11), false);
  assert.equal(shouldRequestInterstitial(16), false);
  assert.equal(shouldRequestInterstitial(21), false);
});

test("mock rewarded show can succeed, fail, or cancel", async () => {
  resetAdService();
  setAdMock({ delayMs: 0, result: "success" });
  assert.equal(await showRewardedVideo("revive", 11), "success");
  setAdMock({ result: "fail" });
  assert.equal(await showRewardedVideo("peek", 2), "fail");
  setAdMock({ result: "cancel" });
  assert.equal(await showRewardedVideo("heart", 2), "cancel");
  const rewarded = adRequests().filter((r) => r.kind === "rewarded");
  assert.equal(rewarded.length, 3);
  assert.deepEqual(
    rewarded.map((r) => r.scene),
    ["revive", "peek", "heart"],
  );
});

test("createRewardedVideoAd mock is not a silent no-op", async () => {
  resetAdService();
  setAdMock({ delayMs: 0, result: "success" });
  const ad = createRewardedVideoAd();
  const result = await ad.show();
  assert.equal(result, "success");
  ad.destroy();
});

test("L11+ fail can offer revive; L1–10 cannot", () => {
  for (let id = 1; id <= 10; id++) {
    assert.equal(reviveOnDeath(id), false, `L${id} death must not offer revive`);
  }
  for (const id of [11, 15, 21, 30]) {
    assert.equal(reviveOnDeath(id), true, `L${id} death may offer rewarded revive`);
  }
});

test("showInterstitial skips L1–9 and records L10/15/20/25/30", async () => {
  resetAdService();
  resetAdBus();
  setAdMock({ delayMs: 0, result: "success" });
  assert.equal(await showInterstitial(1), "skipped");
  assert.equal(await showInterstitial(9), "skipped");
  assert.equal(adRequests().length, 0);
  assert.equal(await showInterstitial(10), "success");
  assert.equal(await showInterstitial(15), "success");
  assert.equal(emitClear(10)?.kind, "interstitial");
  assert.equal(
    adRequests().filter((r) => r.kind === "interstitial").map((r) => r.levelId).join(","),
    "10,15",
  );
});
