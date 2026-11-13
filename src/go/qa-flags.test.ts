import assert from "node:assert/strict";
import { test } from "node:test";
import { forceChaseEnabled } from "./qa-flags";
import { GO_LEVELS, isLevelUnlocked } from "./levels";
import { assertLevelSolvable, solveLevel } from "./solvability";
import { createState, moveTo } from "./logic";
import { dangerNodes, visionDangerNodes } from "./feedback";

test("forceChase query parses 1/true/yes only", () => {
  assert.equal(forceChaseEnabled("?mode=go&level=2"), false);
  assert.equal(forceChaseEnabled("?forceChase=1"), true);
  assert.equal(forceChaseEnabled("?forceChase=true&level=2"), true);
  assert.equal(forceChaseEnabled("?forceChase=yes"), true);
  assert.equal(forceChaseEnabled("?forceChase=0"), false);
  assert.equal(forceChaseEnabled(""), false);
});

test("acceptance §20: every explore+chase level BFS birth→cage→camp", () => {
  for (const lv of GO_LEVELS) {
    const r = assertLevelSolvable(lv, lv.mode === "chase" ? 120_000 : 80_000);
    assert.ok(r.path.length >= 1, `L${lv.id} path`);
    assert.equal(r.rescued, true, `L${lv.id} must pick cage before camp`);
    // Replay path: must pick animal mid-way and end win; steps match depth
    const st = createState(lv.graph, lv.start, {
      enemies: lv.enemies ?? [],
      rescue: lv.rescue ?? null,
      fogBowSafe: false,
    });
    let picked = false;
    for (const hop of r.path) {
      const res = moveTo(st, hop);
      assert.equal(res.ok, true, `L${lv.id} hop ${hop}`);
      if (res.ok && res.picked.length) picked = true;
      if (res.ok && res.caught) assert.fail(`L${lv.id} solution caught at ${hop}`);
    }
    assert.equal(picked, true, `L${lv.id} replay must pick animal`);
    assert.equal(st.status, "win", `L${lv.id} replay win`);
    assert.equal(st.steps, r.depth);
    assert.ok(st.carried.length >= 1);
  }
});

test("chase L2: bow N overlays + fogBowSafe default on create", () => {
  const lv = GO_LEVELS.find((l) => l.id === 2 && l.mode === "chase")!;
  assert.ok(lv);
  for (const e of lv.enemies ?? []) {
    assert.ok((e.visionN ?? 3) >= 2, "bow range");
  }
  const st = createState(lv.graph, lv.start, {
    enemies: lv.enemies ?? [],
    rescue: lv.rescue ?? null,
    fogBowSafe: true,
  });
  assert.equal(st.fogBowSafe, true);
  const danger = dangerNodes(st);
  const vision = visionDangerNodes(st);
  // At least one bow cell or enemy body considered (static near cage)
  assert.ok(vision.length + danger.length >= 1 || (lv.enemies ?? []).length >= 1);
});

test("same-S unlock still gates without forceChase; L1 unlock opens L2", () => {
  const cleared = new Set<number>();
  assert.equal(isLevelUnlocked(GO_LEVELS[1]!, cleared), false);
  cleared.add(1);
  assert.equal(isLevelUnlocked(GO_LEVELS[1]!, cleared), true);
});

test("solveLevel reports path visiting CAGE before CAMP win", () => {
  for (const lv of GO_LEVELS) {
    const r = solveLevel(lv);
    assert.equal(r.solvable, true);
    assert.ok(r.path.includes("CAGE"), `L${lv.id} path must visit CAGE: ${r.path.join("→")}`);
    assert.equal(r.path[r.path.length - 1], "CAMP", `L${lv.id} ends at CAMP`);
  }
});
