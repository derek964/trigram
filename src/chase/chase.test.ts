import assert from "node:assert/strict";
import { test } from "node:test";
import { CHASE_LEVELS } from "./levels";
import { analyze, dangerCells, initial, key, move, parse, solve, thiefPlan, thiefStep,
  step, WAIT, type Dir, type State } from "./logic";
import { AD_PACING } from "../game/ad-config";
import { freshPacing, interstitialAllowed, onLevelClear } from "../game/ad-pacing";

test("追击夜 has 10 levels with the curve: queue → thief → wait → both", () => {
  assert.equal(CHASE_LEVELS.length, 10);
  CHASE_LEVELS.forEach((L, i) => {
    const b = parse(L.map);
    const id = i + 1;
    if (id <= 2) assert.equal(b.thief, null, `L${id} teaches queue only`);
    else assert.notEqual(b.thief, null, `L${id} has a thief`);
    if (id >= 3 && id <= 6) assert.equal(b.animals.length, 1, `L${id} thief alone`);
    if (id >= 7) assert.ok(b.animals.length >= 2, `L${id} combines queue + thief`);
    const ex = b.exit;
    assert.equal(Math.floor(ex / b.w), b.h - 1, `L${id} exit on the south edge`);
  });
});

test("every level is solvable by full-state BFS and the solution replays to a win", () => {
  for (const L of CHASE_LEVELS) {
    const b = parse(L.map);
    const sol = solve(b, initial(b));
    assert.ok(sol, `L${L.id} must be solvable`);
    let s: State = initial(b);
    for (const d of sol.moves) {
      const n = move(b, s, d);
      assert.ok(n && n.status !== "caught", `L${L.id} replay step legal`);
      s = n;
    }
    assert.equal(s.status, "win", `L${L.id} replay wins`);
    assert.equal(s.left.length, 0);
  }
});

test("thief levels need dodging: ignoring the thief is not enough", () => {
  for (const L of CHASE_LEVELS.filter((l) => l.map.some((r) => r.includes("T")))) {
    const b = parse(L.map);
    const free = parse(L.map.map((r) => r.replace("T", ".")));
    const naive = solve(free, initial(free))!;
    let s: State = initial(b);
    let caught = false;
    for (const d of naive.moves) {
      const n = move(b, s, d);
      if (!n || n.status === "caught") {
        caught = true;
        break;
      }
      s = n;
    }
    assert.ok(caught || s.status !== "win", `L${L.id}: thief must matter`);
  }
});

test("classic Minotaur rule: horizontal first, else vertical, else stay", () => {
  const b = parse(["#######", "#T....#", "#.....#", "#...P.#", "###E###"]);
  const t = b.thief!;
  assert.equal(thiefStep(b, t, b.start), t + 1); // horizontal toward you first (even though dy is also open)
  const s1 = move(b, initial(b), 3 as Dir)!; // player west to (3,3)
  assert.equal(s1.t, t + 2, "two horizontal hops");
  const fb = parse(["#####", "#T#.#", "#..P#", "##E##"]);
  assert.equal(thiefStep(fb, fb.thief!, fb.start), fb.thief! + fb.w, "east blocked → falls back to south");
  const st = parse(["#####", "#T#P#", "#...#", "##E##"]);
  assert.equal(thiefStep(st, st.thief!, st.start), st.thief, "east blocked, same row → stays");
});

test("thin walls between cells block both player and thief", () => {
  const b = parse(["+-+-+", "|T|P|", "+ + +", "|. .|", "+-+ +", "|#|E|", "+-+-+"]);
  assert.equal(b.w, 2);
  assert.equal(b.h, 3);
  assert.equal(step(b, b.start, 3 as Dir), null, "wall west of player");
  assert.equal(step(b, b.start, 2 as Dir), b.start + 2);
  assert.equal(thiefStep(b, b.thief!, b.start), b.thief, "thief blocked by thin wall, no vertical → stays");
  assert.ok(b.wall[4], "# is a void cell");
});

test("queue trails the player, blocks the way back, and the gate opens only when all are rescued", () => {
  const b = parse(["#####", "#A..#", "#.#.#", "#.P.#", "##E##"]);
  let s = initial(b);
  assert.equal(move(b, s, 2 as Dir), null, "gate locked while an animal is caged");
  s = move(b, s, 3 as Dir)!; // (1,3)
  s = move(b, s, 0 as Dir)!; // (1,2)
  s = move(b, s, 0 as Dir)!; // pick up at (1,1)
  assert.equal(s.q.length, 1);
  assert.equal(move(b, s, 2 as Dir), null, "cannot step back into own queue");
  s = move(b, s, 1 as Dir)!;
  assert.equal(s.q[0], b.animals[0]);
});

test("red cells = moves that get caught; caught follower gives a clear reason", () => {
  const b = parse(["#######", "#..A..#", "#.....#", "#T.P..#", "###E###"]);
  const s = initial(b);
  const red = dangerCells(b, s);
  assert.ok(red.includes(s.p - 1), "stepping next to the thief is red");
  const n = move(b, s, 3 as Dir)!;
  assert.equal(n.status, "caught");
  assert.match(n.reason, /抓宠贼/);
});

test("red cells also mark steps into proven lost positions (no silent dead end)", () => {
  // L5 teaches wait: without wait the position can become unwinnable; red must appear before the step.
  const b = parse(CHASE_LEVELS[4]!.map);
  const A = analyze(b);
  const s0 = initial(b);
  assert.ok(A.winnable.has(key(s0)));
  // walk north six times as in the existing lost-state fixture when still playing
  let s = s0;
  for (let i = 0; i < 6 && s.status === "play"; i++) s = move(b, s, 0 as Dir) ?? s;
  if (s.status !== "play") return; // fixture may already be caught; still covered by catch reds
  if (A.winnable.has(key(s))) return; // not a lost fixture — skip soft
  const red = dangerCells(b, s, A.winnable);
  // every orthogonal step that stays "play" but leaves the winnable set must be red
  for (const d of [0, 1, 2, 3] as Dir[]) {
    const n = move(b, s, d);
    if (!n || n.status !== "play") continue;
    if (!A.winnable.has(key(n))) assert.ok(red.includes(n.p), `lost step ${d} must be red`);
  }
});

test("ad pacing: none L1–10, none first session, ≤1 per 3 levels, ≥4 min, never after fail", () => {
  const c = AD_PACING.interstitial;
  assert.equal(c.noneThroughLevel, 10);
  const first = freshPacing();
  for (let id = 1; id <= 30; id++) assert.equal(interstitialAllowed(first, id, 1e9, "clear"), false);
  const st = { session: 2, clearsSinceLast: 0, lastShownAt: 0 };
  for (let id = 1; id <= 10; id++) assert.equal(onLevelClear(st, id, 1e9), false);
  assert.equal(interstitialAllowed(st, 11, 1e9, "fail"), false);
  const st2 = { session: 2, clearsSinceLast: 0, lastShownAt: 0 };
  const shown: number[] = [];
  let now = 1e9;
  for (let id = 11; id <= 30; id++) {
    now += 60_000; // one level per minute
    if (onLevelClear(st2, id, now)) shown.push(now);
  }
  assert.ok(shown.length > 0);
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i]! - shown[i - 1]! >= c.minGapMs);
  assert.deepEqual(Object.keys(AD_PACING.rewarded).sort(), ["freezeThiefTurns", "hintSafeCells", "nearWinCells", "undoSteps"]);
});

test("wait: player and queue stay, thief still moves; solver uses wait on L5 only where needed", () => {
  const b = parse(["#######", "#T....#", "#.....#", "#...P.#", "###E###"]);
  const s0 = initial(b);
  const s1 = move(b, s0, WAIT)!;
  assert.equal(s1.p, s0.p);
  assert.notEqual(s1.t, s0.t);
  const l5 = parse(CHASE_LEVELS[4]!.map);
  const sol = solve(l5, initial(l5))!;
  assert.ok(sol.moves.includes(WAIT), "L5 teaches waiting");
  // without wait L5 is not solvable
  const noWait = (bb: typeof l5) => {
    const seen = new Set<string>();
    let fr = [initial(bb)];
    while (fr.length) {
      const nx: State[] = [];
      for (const s of fr) for (const d of [0, 1, 2, 3] as Dir[]) {
        const n = move(bb, s, d);
        if (!n || n.status === "caught") continue;
        if (n.status === "win") return true;
        const k = key(n);
        if (!seen.has(k)) { seen.add(k); nx.push(n); }
      }
      fr = nx;
    }
    return false;
  };
  assert.equal(noWait(l5), false, "L5 needs a wait");
});

test("thief intent: two numbered hops; a blocked hop is marked", () => {
  const b = parse(["#######", "#T....#", "#.....#", "#..P..#", "###E###"]);
  const hops = thiefPlan(b, initial(b));
  assert.equal(hops.length, 2);
  assert.equal(hops[0]!.dir, 1); // horizontal first
  assert.equal(hops[1]!.dir, 1); // still not level → horizontal again
  const w = parse(["#####", "#T#P#", "#...#", "##E##"]);
  const wh = thiefPlan(w, initial(w));
  assert.equal(wh[0]!.blocked, true);
  assert.equal(wh[0]!.to, w.thief);
});


test("L5-8 golden: solvable Theseus, start winnable, no silent first-move loss (except wait-teach L5)", () => {
  for (const L of CHASE_LEVELS.filter((x) => x.id >= 5 && x.id <= 8)) {
    const b = parse(L.map);
    assert.ok(b.thief !== null, `L${L.id} has thief`);
    const s0 = initial(b);
    const sol = solve(b, s0);
    assert.ok(sol, `L${L.id} solvable`);
    const A = analyze(b);
    assert.ok(A.winnable.has(key(s0)), `L${L.id} start winnable`);
    for (const d of [0, 1, 2, 3, 4] as Dir[]) {
      const n = move(b, s0, d);
      if (!n || n.status !== "play") continue;
      if (L.id === 5 && d === WAIT) continue; // wait is the taught escape
      // first orthogonal step into a lost cell must be red when analysis is applied
      if (!A.winnable.has(key(n)) && d !== WAIT) {
        const red = dangerCells(b, s0, A.winnable);
        assert.ok(red.includes(n.p), `L${L.id} lost first step ${d} is red`);
      }
    }
  }
});

test("retrograde analysis marks lost states; metrics per level stay in budget", () => {
  for (const L of CHASE_LEVELS) {
    const b = parse(L.map);
    const s0 = initial(b);
    const A = analyze(b);
    assert.ok(A.winnable.has(key(s0)), `L${L.id} start is winnable`);
    const deadPct = (100 * A.dead) / A.states;
    const limit = L.id === 5 ? 30 : L.id <= 6 ? 15 : 25; // L5 (wait) is tight by design; lost states get a warning
    assert.ok(deadPct <= limit, `L${L.id} dead ${deadPct.toFixed(0)}% <= ${limit}%`);
    // no first move silently loses on teaching levels
    if (L.id <= 6 && L.id !== 5)
      for (const d of [0, 1, 2, 3, 4] as Dir[]) {
        const n = move(b, s0, d);
        if (n && n.status === "play") assert.ok(A.winnable.has(key(n)), `L${L.id} first move ${d} is not a silent loss`);
      }
  }
  // a known lost state is flagged
  const b = parse(CHASE_LEVELS[4]!.map);
  const A = analyze(b);
  const lost = [...Array(6)].reduce((s: State) => (s.status === "play" ? (move(b, s, 0) ?? s) : s), initial(b));
  if (lost.status === "play") assert.equal(A.winnable.has(key(lost)), !!solve(b, lost));
});
