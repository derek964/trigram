import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adBus,
  emitClear,
  emitDeath,
  interstitialOnClear,
  resetAdBus,
  reviveOnDeath,
} from "./ads";

test("L1–5 (and L1–9) clear emits no interstitial", () => {
  resetAdBus();
  for (let id = 1; id <= 9; id++) {
    assert.equal(interstitialOnClear(id), false, `L${id} should not interstitial`);
    assert.equal(emitClear(id), null);
  }
  assert.equal(adBus.of("interstitial").length, 0);
});

test("L10 / L15 / L20 / L25 / L30 clear emit interstitial", () => {
  resetAdBus();
  for (const id of [10, 15, 20, 25, 30]) {
    assert.equal(interstitialOnClear(id), true);
    const ev = emitClear(id);
    assert.ok(ev);
    assert.equal(ev.kind, "interstitial");
    assert.equal(ev.levelId, id);
  }
  assert.equal(adBus.of("interstitial").length, 5);
  assert.equal(emitClear(11), null);
  assert.equal(adBus.of("interstitial").length, 5);
});

test("death on L11+ emits revive_offer; L1–10 do not", () => {
  resetAdBus();
  for (let id = 1; id <= 10; id++) {
    assert.equal(reviveOnDeath(id), false, `L${id} death should not revive-offer`);
    assert.equal(emitDeath(id), null);
  }
  assert.equal(adBus.of("revive_offer").length, 0);
  for (const id of [11, 15, 21, 30]) {
    assert.equal(reviveOnDeath(id), true);
    const ev = emitDeath(id);
    assert.ok(ev);
    assert.equal(ev.kind, "revive_offer");
    assert.equal(ev.levelId, id);
  }
  assert.equal(adBus.of("revive_offer").length, 4);
});
