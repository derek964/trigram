import assert from "node:assert/strict";
import { test } from "node:test";
import { adjacency, areAdjacent, neighborsOf, type Graph } from "./graph";
import {
  createState,
  enemyNode,
  enemyVision,
  moveTo,
  neighbors,
  tickE1,
  wait,
  type E1Def,
  type E1State,
} from "./logic";
import {
  COLOR_ADJACENT,
  COLOR_DANGER,
  COLOR_PREVIEW,
  dangerNodes,
  feedbackKind,
  isCatchOnStep,
  peekNextE1,
  previewNodes,
  visionDangerNodes,
} from "./feedback";
import { visionCells } from "./vision";
import { pickCageSidePost } from "./maze-gen";
import { GO_LEVELS } from "./levels";
import { cloneGoState, solveLevel } from "./solvability";
import { UNDO_MAX, UndoStack } from "./history";
import { HINTS_PER_LEVEL, nextHintHop, adReviveHintPlaceholder } from "./hint";

const CROSS: Graph = {
  nodes: {
    C: { x: 0, y: 0 },
    N: { x: 0, y: -1 },
    E: { x: 1, y: 0 },
    S: { x: 0, y: 1 },
    W: { x: -1, y: 0 },
  },
  edges: [
    ["C", "N"],
    ["C", "E"],
    ["C", "S"],
    ["C", "W"],
  ],
};

test("adjacency list is undirected and complete", () => {
  const adj = adjacency(CROSS);
  assert.deepEqual(adj.C, ["E", "N", "S", "W"]);
  assert.deepEqual(adj.N, ["C"]);
  assert.deepEqual(adj.E, ["C"]);
  assert.equal(areAdjacent(CROSS, "N", "S"), false);
  assert.equal(areAdjacent(CROSS, "C", "N"), true);
  assert.equal(areAdjacent(CROSS, "C", "C"), false);
});

test("legal move to adjacent node succeeds", () => {
  const st = createState(CROSS, "C");
  const r = moveTo(st, "N");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.from, "C");
    assert.equal(r.to, "N");
    assert.equal(r.caught, false);
  }
  assert.equal(st.player, "N");
  assert.equal(st.steps, 1);
  assert.deepEqual(neighbors(st), ["C"]);
  assert.equal(st.status, "play");
});

test("non-adjacent move is rejected", () => {
  const st = createState(CROSS, "N");
  const r = moveTo(st, "S");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "not-adjacent");
  assert.equal(st.player, "N");
  assert.equal(st.steps, 0);
});

test("wait / same-node action is forbidden", () => {
  const st = createState(CROSS, "C");
  const same = moveTo(st, "C");
  assert.equal(same.ok, false);
  if (!same.ok) assert.equal(same.reason, "wait-forbidden");
  const w = wait(st);
  assert.equal(w.ok, false);
  if (!w.ok) assert.equal(w.reason, "wait-forbidden");
  assert.equal(st.player, "C");
  assert.equal(st.steps, 0);
});

test("hand-authored levels have start in graph and edges valid", () => {
  for (const lv of GO_LEVELS) {
    assert.ok(lv.start in lv.graph.nodes, `${lv.name} start`);
    for (const [a, b] of lv.graph.edges) {
      assert.ok(a in lv.graph.nodes, `${lv.name} edge ${a}`);
      assert.ok(b in lv.graph.nodes, `${lv.name} edge ${b}`);
      assert.notEqual(a, b);
    }
    const n = neighborsOf(lv.graph, lv.start);
    assert.ok(n.length > 0, `${lv.name} start isolated`);
    for (const e of lv.enemies ?? []) {
      assert.ok(e.path.length >= 1, `${lv.name} ${e.id} path`);
      for (const node of e.path) assert.ok(node in lv.graph.nodes, `${lv.name} ${e.id} ${node}`);
    }
  }
});

test("polyline E1 advances one beat and reverses at ends", () => {
  const e: E1State = {
    id: "p",
    path: ["N", "C", "S"],
    kind: "polyline",
    index: 0,
    dir: 1,
    facing: "S",
    visionN: 3,
  };
  tickE1(e, CROSS);
  assert.equal(enemyNode(e), "C");
  assert.equal(e.dir, 1);
  assert.equal(e.facing, "S");
  tickE1(e, CROSS);
  assert.equal(enemyNode(e), "S");
  tickE1(e, CROSS); // reverse
  assert.equal(enemyNode(e), "C");
  assert.equal(e.dir, -1);
  assert.equal(e.facing, "N");
  tickE1(e, CROSS);
  assert.equal(enemyNode(e), "N");
  tickE1(e, CROSS); // reverse again
  assert.equal(enemyNode(e), "C");
  assert.equal(e.dir, 1);
});

test("ring E1 wraps around the path", () => {
  const RING: Graph = {
    nodes: {
      C: { x: 0, y: 0 },
      E: { x: 1, y: 0 },
      SE: { x: 1, y: 1 },
      S: { x: 0, y: 1 },
    },
    edges: [
      ["C", "E"],
      ["E", "SE"],
      ["SE", "S"],
      ["S", "C"],
    ],
  };
  const e: E1State = {
    id: "r",
    path: ["C", "E", "SE", "S"],
    kind: "ring",
    index: 3,
    dir: 1,
    facing: "N",
    visionN: 3,
  };
  tickE1(e, RING);
  assert.equal(enemyNode(e), "C");
  assert.equal(e.facing, "N"); // S→C
  tickE1(e, RING);
  assert.equal(enemyNode(e), "E");
  assert.equal(e.facing, "E");
});

test("after player move, E1 ticks once; same node is caught", () => {
  // Enemy N→C→S starts at N facing away (N) so pre-tick vision misses C.
  // Player W→C; then enemy ticks N→C → contact catch.
  const enemies: E1Def[] = [
    {
      id: "e1",
      kind: "polyline",
      path: ["N", "C", "S"],
      startIndex: 0,
      startDir: 1,
      facing: "N",
      visionN: 3,
    },
  ];
  const st = createState(CROSS, "W", enemies);
  assert.equal(enemyNode(st.enemies[0]!), "N");
  const r = moveTo(st, "C");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.caught, true);
  assert.equal(st.player, "C");
  assert.equal(enemyNode(st.enemies[0]!), "C");
  assert.equal(st.status, "caught");
  assert.match(st.reason, /同节点/);
});

test("player can dodge: enemy ticks away so no shared node", () => {
  // Enemy at C going to S. Player W→N; enemy C→S — no collide.
  const enemies: E1Def[] = [
    { id: "e1", kind: "polyline", path: ["N", "C", "S"], startIndex: 1, startDir: 1 },
  ];
  const st = createState(CROSS, "W", enemies);
  const r = moveTo(st, "C"); // player to C; enemy C→S
  // Wait — player moves to C first while enemy still on C, then enemy ticks to S.
  // After resolution: player C, enemy S — NOT caught (order: player then E1).
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.caught, false);
  assert.equal(st.player, "C");
  assert.equal(enemyNode(st.enemies[0]!), "S");
  assert.equal(st.status, "play");
});

test("rejected move does not tick enemies", () => {
  const enemies: E1Def[] = [
    { id: "e1", kind: "polyline", path: ["N", "C", "S"], startIndex: 0, startDir: 1 },
  ];
  const st = createState(CROSS, "W", enemies);
  const r = moveTo(st, "W");
  assert.equal(r.ok, false);
  assert.equal(enemyNode(st.enemies[0]!), "N");
  assert.equal(st.steps, 0);
});

test("touch animal then reach safe → win", () => {
  const st = createState(CROSS, "W", {
    rescue: { animals: { E: "rabbit" }, safe: "S" },
  });
  assert.equal(moveTo(st, "C").ok, true);
  assert.deepEqual(st.carried, []);
  assert.equal(st.status, "play");
  const pick = moveTo(st, "E");
  assert.equal(pick.ok, true);
  if (pick.ok) {
    assert.deepEqual(pick.picked, ["rabbit"]);
    assert.equal(pick.won, false);
  }
  assert.deepEqual(st.carried, ["rabbit"]);
  assert.equal(Object.keys(st.animalsLeft).length, 0);
  // back to C then S (camp)
  assert.equal(moveTo(st, "C").ok, true);
  const win = moveTo(st, "S");
  assert.equal(win.ok, true);
  if (win.ok) assert.equal(win.won, true);
  assert.equal(st.status, "win");
  assert.match(st.reason, /营地/);
});

test("reaching safe without animal does not win", () => {
  const st = createState(CROSS, "W", {
    rescue: { animals: { E: "rabbit" }, safe: "S" },
  });
  moveTo(st, "C");
  const r = moveTo(st, "S");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.won, false);
  assert.equal(st.status, "play");
  assert.deepEqual(st.carried, []);
});

test("rescue still loses if E1 collides after move", () => {
  const st = createState(CROSS, "W", {
    enemies: [
      {
        id: "e1",
        kind: "polyline",
        path: ["N", "C", "S"],
        startIndex: 0,
        startDir: 1,
        facing: "N",
        visionN: 3,
      },
    ],
    rescue: { animals: { E: "rabbit" }, safe: "S" },
  });
  // W→C while enemy N→C → caught; no win even if somehow at safe later
  const r = moveTo(st, "C");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.caught, true);
    assert.equal(r.won, false);
  }
  assert.equal(st.status, "caught");
});

test("levels with rescue declare animal and safe nodes on graph", () => {
  for (const lv of GO_LEVELS) {
    if (!lv.rescue) continue;
    assert.ok(lv.rescue.safe in lv.graph.nodes, `${lv.name} safe`);
    for (const node of Object.keys(lv.rescue.animals)) {
      assert.ok(node in lv.graph.nodes, `${lv.name} animal@${node}`);
    }
  }
});


test("feedback hex Art dark variants (product unlocked on #C9BBA8)", () => {
  assert.equal(COLOR_ADJACENT, "#35504A");
  assert.equal(COLOR_PREVIEW, "#314F5D");
  assert.equal(COLOR_DANGER, "#7F3629");
});

test("peekNextE1 polyline reverses at end without mutating", () => {
  const e: E1State = {
    id: "e",
    path: ["N", "C", "S"],
    kind: "polyline",
    index: 2,
    dir: 1,
    facing: "S",
    visionN: 3,
  };
  assert.equal(peekNextE1(e), "C");
  assert.equal(e.index, 2);
  assert.equal(e.dir, 1);
  tickE1(e, CROSS);
  assert.equal(enemyNode(e), "C");
  assert.equal(e.dir, -1);
});

test("peekNextE1 ring wraps", () => {
  const e: E1State = {
    id: "e",
    path: ["N", "E", "S", "W"],
    kind: "ring",
    index: 3,
    dir: 1,
    facing: "N",
    visionN: 3,
  };
  assert.equal(peekNextE1(e), "N");
});

test("previewNodes lists E1 next-beat tiles", () => {
  const st = createState(CROSS, "W", {
    enemies: [{ id: "e1", kind: "polyline", path: ["N", "C", "S"], startIndex: 0, startDir: 1 }],
  });
  assert.deepEqual(previewNodes(st), ["C"]);
  // enemy at N facing S → vision includes C (and S); stepping C is death
  assert.equal(isCatchOnStep(st, "C"), true);
  assert.ok(dangerNodes(st).includes("C"));
  assert.ok(visionDangerNodes(st).includes("C"));
});

test("enemy body tile safe when they walk away — unless bow vision covers it", () => {
  const st = createState(CROSS, "W", {
    enemies: [{ id: "e1", kind: "polyline", path: ["N", "C", "S"], startIndex: 0, startDir: 1 }],
  });
  // enemy at N facing S (toward C); vision does not include N (own tile).
  // Stepping onto N: enemy leaves to C — contact clear; post-tick facing S from C → vision S, not N.
  assert.equal(isCatchOnStep(st, "N"), false);
  assert.equal(dangerNodes(st).includes("N"), false);
  assert.equal(dangerNodes(st).includes("C"), true);
});

test("stationary E0 marks its tile as catch-danger", () => {
  const st = createState(CROSS, "W", {
    enemies: [{ id: "e0", kind: "static", path: ["C"], facing: "S", visionN: 3 }],
  });
  assert.deepEqual(previewNodes(st), ["C"]);
  assert.equal(isCatchOnStep(st, "C"), true);
  assert.ok(dangerNodes(st).includes("C"));
  assert.ok(visionDangerNodes(st).includes("S"));
});

test("feedbackKind priority danger > preview > adjacent", () => {
  const st = createState(CROSS, "W", {
    enemies: [{ id: "e1", kind: "polyline", path: ["N", "C", "S"], startIndex: 0, startDir: 1 }],
  });
  const neigh = new Set(neighbors(st)); // C
  const preview = new Set(previewNodes(st)); // C
  const danger = new Set(dangerNodes(st)); // C
  // Adjacent catch-on-step → danger (must-die tap)
  assert.equal(feedbackKind(st, "C", neigh, preview, danger), "danger");
  assert.equal(feedbackKind(st, "N", neigh, preview, danger), "none");
  // Danger set (vision / catch) paints danger even when not adjacent
  assert.equal(
    feedbackKind(st, "C", new Set(), preview, danger),
    "danger",
  );
  // after enemy moves toward S, from player at C with no enemies on adj — check adjacent alone
  const st2 = createState(CROSS, "C");
  assert.equal(
    feedbackKind(st2, "N", new Set(["N", "E", "S", "W"]), new Set(), new Set()),
    "adjacent",
  );
  assert.equal(
    feedbackKind(st2, "N", new Set(["N"]), new Set(["N"]), new Set()),
    "preview",
  );
});


test("GO_LEVELS ships exactly 8 levels indexed id 1..8", () => {
  assert.equal(GO_LEVELS.length, 8);
  GO_LEVELS.forEach((lv, i) => {
    assert.equal(lv.id, i + 1, `index ${i} id`);
    assert.ok(lv.rescue, `L${lv.id} needs rescue win`);
    assert.ok(lv.rescue!.safe in lv.graph.nodes);
  });
});

test("each of L1–8 is BFS-solvable (player × E1 phase × carried)", () => {
  for (const lv of GO_LEVELS) {
    const r = solveLevel(lv);
    assert.equal(r.solvable, true, `L${lv.id} ${lv.name} unsolvable states=${r.states}`);
    assert.ok(r.depth >= 1, `L${lv.id} depth`);
  }
});

test("dual-mode pairs: explore then chase share S; S0=7 then +1", () => {
  assert.equal(GO_LEVELS.length, 8);
  for (let i = 0; i < 4; i++) {
    const ex = GO_LEVELS[i * 2]!;
    const ch = GO_LEVELS[i * 2 + 1]!;
    assert.equal(ex.mode, "explore");
    assert.equal(ch.mode, "chase");
    assert.equal(ex.S, ch.S);
    assert.equal(ex.S, 7 + i);
    assert.equal((ex.enemies ?? []).length, 0);
    assert.ok((ch.enemies ?? []).length >= 1, `chase L${ch.id} needs enemy`);
    assert.equal(Object.keys(ex.rescue!.animals).length, 1);
    assert.equal(Object.keys(ch.rescue!.animals).length, 1);
    assert.equal(ex.start, "CAMP");
    assert.ok("CAGE" in ex.graph.nodes);
  }
  assert.equal(GO_LEVELS[0]!.visionR, 3);
  assert.equal(GO_LEVELS[2]!.visionR, 2);
  assert.equal(GO_LEVELS[1]!.enemies![0]!.kind, "static");
  assert.equal(GO_LEVELS[5]!.enemies![0]!.kind, "polyline");
  assert.equal(GO_LEVELS[7]!.enemies![0]!.kind, "ring");
});

test("chase levels stay BFS-solvable under full bow", () => {
  for (const lv of GO_LEVELS.filter((l) => l.mode === "chase")) {
    assert.equal(solveLevel(lv).solvable, true, `L${lv.id} ${lv.name}`);
  }
});


test("UndoStack restores player + E1 + animals; caps at UNDO_MAX", () => {
  const enemies: E1Def[] = [
    {
      id: "e1",
      kind: "polyline",
      path: ["N", "C", "S"],
      startIndex: 0,
      startDir: 1,
      facing: "N", // face away so W→C is contact-after-tick, not pre-tick vision
      visionN: 3,
    },
  ];
  const st = createState(CROSS, "W", {
    enemies,
    rescue: { animals: { E: "bunny" }, safe: "E" },
  });
  const stack = new UndoStack(3);
  stack.push(st);
  moveTo(st, "C");
  assert.equal(st.player, "C");
  assert.equal(enemyNode(st.enemies[0]!), "C");
  const back = stack.pop()!;
  assert.equal(back.player, "W");
  assert.equal(enemyNode(back.enemies[0]!), "N");
  assert.equal(back.status, "play");

  // cap
  const cap = new UndoStack(2);
  const a = createState(CROSS, "C");
  cap.push(a);
  moveTo(a, "N");
  cap.push(a);
  moveTo(a, "C");
  cap.push(a);
  assert.equal(cap.size, 2);
  assert.equal(UNDO_MAX, 20);
});

test("undo after catch restores play and does not softlock", () => {
  const enemies: E1Def[] = [
    {
      id: "e1",
      kind: "polyline",
      path: ["N", "C", "S"],
      startIndex: 0,
      startDir: 1,
      facing: "N",
      visionN: 3,
    },
  ];
  const st = createState(CROSS, "W", enemies);
  const stack = new UndoStack();
  stack.push(st);
  const r = moveTo(st, "C");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.caught, true);
  assert.equal(st.status, "caught");
  const prev = stack.pop()!;
  Object.assign(st, prev); // simulate UI restore
  // better: replace fields via clone
  const restored = cloneGoState(prev);
  assert.equal(restored.status, "play");
  assert.equal(restored.player, "W");
  const again = moveTo(restored, "C");
  assert.equal(again.ok, true);
});

test("nextHintHop returns first hop of a shortest solvable path", () => {
  const lv = GO_LEVELS[0]!;
  const st = createState(lv.graph, lv.start, {
    enemies: lv.enemies ?? [],
    rescue: lv.rescue ?? null,
  });
  const h = nextHintHop(st);
  assert.ok(h.next, "L1 should have a hint hop");
  assert.ok(h.depth >= 1);
  // hop must be adjacent
  assert.ok(neighbors(st).includes(h.next!));
  // following the hinted path should eventually win within depth*2 steps (sanity)
  let cur = cloneGoState(st);
  let guard = 40;
  while (cur.status === "play" && guard-- > 0) {
    const step = nextHintHop(cur);
    assert.ok(step.next, `stuck at ${cur.player}`);
    const r = moveTo(cur, step.next!);
    assert.equal(r.ok, true);
  }
  assert.equal(cur.status, "win");
  assert.equal(HINTS_PER_LEVEL, 3);
  assert.equal(adReviveHintPlaceholder().granted, 1);
});

test("hint does not suggest a catch-on-step when a safe win path exists", () => {
  const lv = GO_LEVELS[1]!; // L2 chase has E0 static
  const st = createState(lv.graph, lv.start, {
    enemies: lv.enemies ?? [],
    rescue: lv.rescue ?? null,
  });
  const h = nextHintHop(st);
  assert.ok(h.next);
  const probe = cloneGoState(st);
  const r = moveTo(probe, h.next!);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.caught, false, "hint must not lead into immediate catch");
});


test("bow vision N=3 along facing, wall blocks, no bend", () => {
  // Horizontal corridor W-C-E plus south spur from C; north of C is empty wall.
  const G: Graph = {
    nodes: {
      W: { x: -1, y: 0 },
      C: { x: 0, y: 0 },
      E: { x: 1, y: 0 },
      E2: { x: 2, y: 0 },
      E3: { x: 3, y: 0 },
      S: { x: 0, y: 1 },
    },
    edges: [
      ["W", "C"],
      ["C", "E"],
      ["E", "E2"],
      ["E2", "E3"],
      ["C", "S"],
    ],
  };
  assert.deepEqual(visionCells(G, "W", "E", 3), ["C", "E", "E2"]);
  assert.deepEqual(visionCells(G, "W", "E", 2), ["C", "E"]);
  // Facing N from C: no floor → blocked immediately
  assert.deepEqual(visionCells(G, "C", "N", 3), []);
  // Facing S only sees S (wall beyond)
  assert.deepEqual(visionCells(G, "C", "S", 3), ["S"]);
});

test("E0 static facing marks vision as catch; same-cell after tick still catch", () => {
  const st = createState(CROSS, "W", {
    enemies: [{ id: "e0", kind: "static", path: ["C"], facing: "W", visionN: 3 }],
  });
  assert.deepEqual(enemyVision(st.graph, st.enemies[0]!), ["W"]);
  assert.deepEqual(visionDangerNodes(st), ["W"]);
  // Stepping to C (enemy body) → after tick still on C → contact catch
  const r = moveTo(st, "C");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.caught, true);
  assert.equal(st.status, "caught");
});

test("walking into bow vision before enemy steps is caught", () => {
  const G: Graph = {
    nodes: {
      P: { x: 0, y: 0 },
      V: { x: 1, y: 0 },
      G: { x: 2, y: 0 },
    },
    edges: [
      ["P", "V"],
      ["V", "G"],
    ],
  };
  const st = createState(G, "P", {
    enemies: [{ id: "e0", kind: "static", path: ["G"], facing: "W", visionN: 3 }],
    fogBowSafe: false, // unit: full bow, no fog mercy
  });
  // G facing W sees V, P. Stepping P→V enters vision → caught.
  const r = moveTo(st, "V");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.caught, true);
  assert.match(st.reason, /视线/);
});

test("E2 ring loops and keeps bow vision attached", () => {
  const RING: Graph = {
    nodes: {
      C: { x: 0, y: 0 },
      E: { x: 1, y: 0 },
      SE: { x: 1, y: 1 },
      S: { x: 0, y: 1 },
    },
    edges: [
      ["C", "E"],
      ["E", "SE"],
      ["SE", "S"],
      ["S", "C"],
    ],
  };
  const st = createState(RING, "C", {
    enemies: [
      {
        id: "e2",
        kind: "ring",
        path: ["C", "E", "SE", "S"],
        startIndex: 0,
        startDir: 1,
        visionN: 3,
      },
    ],
  });
  // Start at C; enemy also at C — but catch only on move resolution.
  // Move player C→E while enemy C→E → collide after tick.
  const r = moveTo(st, "E");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.caught, true);
  // Fresh state: enemy starts at E, player at S — safe move S→C
  const st2 = createState(RING, "S", {
    enemies: [
      {
        id: "e2",
        kind: "ring",
        path: ["C", "E", "SE", "S"],
        startIndex: 1, // at E → next SE
        startDir: 1,
        visionN: 3,
      },
    ],
  });
  assert.equal(enemyNode(st2.enemies[0]!), "E");
  // deriveInitialFacing uses next step E→SE → facing S
  assert.equal(st2.enemies[0]!.facing, "S");
  const vis = enemyVision(st2.graph, st2.enemies[0]!);
  assert.ok(vis.includes("SE"));
});

test("cage rescue still wins: touch cage node then camp", () => {
  const lv = GO_LEVELS[0]!;
  assert.ok(lv.rescue);
  const animalNode = Object.keys(lv.rescue!.animals)[0]!;
  assert.equal(animalNode, "CAGE");
  const r = solveLevel(lv);
  assert.equal(r.solvable, true);
});

test("levels declare E0/E1/E2 kinds used in band", () => {
  const kinds = new Set(GO_LEVELS.flatMap((lv) => (lv.enemies ?? []).map((e) => e.kind)));
  assert.ok(kinds.has("static"));
  assert.ok(kinds.has("polyline"));
  assert.ok(kinds.has("ring"));
});

import { isLevelUnlocked } from "./levels";
import { carveMaze } from "./maze-gen";

test("chase unlocks only after same-S explore cleared", () => {
  const cleared = new Set<number>();
  assert.equal(isLevelUnlocked(GO_LEVELS[0]!, cleared), true);
  assert.equal(isLevelUnlocked(GO_LEVELS[1]!, cleared), false);
  cleared.add(1);
  assert.equal(isLevelUnlocked(GO_LEVELS[1]!, cleared), true);
});

test("§10 carveMaze braid 0 is a tree (edgeCount = cells-1)", () => {
  for (const S of [7, 8, 9]) {
    const links = carveMaze(S, 42 + S, 0);
    let edges = 0;
    for (const [a, ns] of links) for (const b of ns) if (a < b) edges++;
    assert.equal(edges, S * S - 1, `S=${S} perfect`);
  }
});

test("fogBowSafe skips arrow catch on unexplored tile; contact still catches", () => {
  // CROSS: W—C—E, N/S. Static at E facing W sees C,W.
  const st = createState(CROSS, "N", {
    enemies: [{ id: "e0", kind: "static", path: ["E"], facing: "W", visionN: 3 }],
    fogBowSafe: true,
    explored: ["N"], // only start explored — C not explored
  });
  assert.equal(st.explored.has("C"), false);
  const r = moveTo(st, "C"); // enter bow on unexplored → fog mercy
  assert.equal(r.ok, true);
  assert.equal(r.caught, false, "dark bow should not catch");
  assert.equal(st.status, "play");
});

import { easeInOut, HOP_SEC, idleBob, lerp, walkBob } from "./anim";

test("hop tween helpers stay in range", () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.ok(easeInOut(0.5) > 0.4 && easeInOut(0.5) < 0.6);
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.ok(Math.abs(walkBob(0)) < 1e-9);
  assert.ok(Math.abs(walkBob(1)) < 1e-9);
  assert.ok(walkBob(0.5) > 0);
  assert.ok(HOP_SEC >= 0.2 && HOP_SEC <= 0.4);
  assert.ok(Number.isFinite(idleBob(1.5, 0.2, 1)));
  // Readable idle amp (go-ui uses max(12, spriteH*0.1)): peak |bob| over samples must be substantial
  {
    const amp = 12;
    let peak = 0;
    for (let t = 0; t < 4; t += 0.05) {
      peak = Math.max(peak, Math.abs(idleBob(t, 0, amp)));
    }
    assert.ok(peak >= 8, `idleBob peak |amp=12| expected >= 8, got ${peak}`);
  }
});


test("cage-side bow faces a walkable corridor, not west into empty", () => {
  // Full 5×5 floors; cage on west edge. Legacy facingIntoWall preferred W off-board.
  const nodes: Graph["nodes"] = {};
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) nodes[`${x},${y}`] = { x, y };
  nodes.CAMP = { x: 4, y: 0 };
  nodes.CAGE = { x: 0, y: 2 };
  delete nodes["4,0"];
  delete nodes["0,2"];
  const edges: [string, string][] = [
    ["CAGE", "1,2"],
    ["1,2", "2,2"],
    ["2,2", "3,2"],
    ["3,2", "4,2"],
    ["4,2", "4,1"],
    ["4,1", "CAMP"],
    ["CAGE", "0,1"],
    ["CAGE", "0,3"],
    ["0,3", "0,4"],
    ["1,2", "1,3"],
    ["1,3", "1,4"],
  ];
  const graph: Graph = { nodes, edges };
  const post = pickCageSidePost(graph, "CAGE", "CAMP", 3);
  assert.ok(post, "static post placed");
  assert.notEqual(post!.facing, "W");
  const los = visionCells(graph, post!.node, post!.facing, 3);
  assert.ok(los.length >= 1 && los.length <= 3, `LOS len ${los.length}`);
});

test("bow vision stops at missing edge (maze wall between floors)", () => {
  const G: Graph = {
    nodes: {
      A: { x: 0, y: 0 },
      B: { x: 1, y: 0 },
      C: { x: 2, y: 0 },
    },
    edges: [["A", "B"]], // wall between B and C despite adjacent floors
  };
  assert.deepEqual(visionCells(G, "A", "E", 3), ["B"]);
});
