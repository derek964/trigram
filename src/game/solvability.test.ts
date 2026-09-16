import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAPTER_NAMES,
  LEVELS,
  LEVEL_COUNT,
  MIN_CORRIDOR,
  minCellHops,
  minGeoSteps,
  showsFingerCue,
  showsJunctionChevron,
  showsPathPreview,
  usesHardVisionMask,
  usesVisionDisc,
  usesWallSilhouette,
} from "./levels";
import {
  cellPathFrom,
  cellPathToCenter,
  courtMouths,
  deadEndLengths,
  generateMaze,
  hasAwayIsNear,
  hasRadialHighway,
  inCenter,
  keyOppositeDoor,
  maxAlignedInward,
  pathTurns,
  punchHole,
  seesIsolationEarly,
  shortestPath,
  type Maze,
} from "./maze";
import { dist } from "./math";

test("campaign ships 30 square levels with shelter chapter names", () => {
  assert.equal(LEVELS.length, LEVEL_COUNT);
  assert.deepEqual([...CHAPTER_NAMES], ["夜巡", "钥匙串", "防盗夜"]);
  assert.equal(LEVELS.filter((l) => l.chapter === 1).length, 10);
  assert.equal(LEVELS.filter((l) => l.chapter === 2).length, 10);
  assert.equal(LEVELS.filter((l) => l.chapter === 3).length, 10);
  for (const cfg of LEVELS) {
    assert.equal(cfg.needsKey, cfg.chapter >= 2);
    assert.equal(cfg.hasChaser, cfg.chapter === 3);
    assert.equal(cfg.gridN % 2, 1, `L${cfg.id} gridN should be odd`);
    assert.match(cfg.title, /[\u4e00-\u9fff]/);
    assert.doesNotMatch(cfg.title, /卦|阵|八卦|观卦/);
    assert.doesNotMatch(
      cfg.title,
      /猫房|医务|犬舍|观察室|护理间|保温箱|静养|特护|水台|口袋|库房|窗台/,
      `L${cfg.id} title "${cfg.title}" still names a fake room`,
    );
    if (cfg.id <= 1) assert.equal(cfg.pattern, "A");
    else if (cfg.id <= 3) assert.equal(cfg.pattern, "B");
    else if (cfg.id <= 10) assert.equal(cfg.pattern, "D");
    else if (cfg.id <= 20) assert.equal(cfg.pattern, "E");
    else assert.equal(cfg.pattern, "F");
    assert.equal(usesVisionDisc(cfg.id), cfg.id >= 2, `L${cfg.id} vision drip`);
    assert.equal(usesWallSilhouette(cfg.id), cfg.id === 2, `L${cfg.id} silhouette only on L2`);
    assert.equal(usesHardVisionMask(cfg.id), cfg.id >= 3, `L${cfg.id} hard FOV from L3`);
    assert.equal(showsJunctionChevron(cfg.id), cfg.id === 2, `L${cfg.id} junction chevron`);
    assert.equal(showsPathPreview(cfg.id), cfg.id <= 2, `L${cfg.id} path-preview ribbon`);
    assert.equal(showsFingerCue(cfg.id), cfg.id === 1, `L${cfg.id} finger cue`);
    if (cfg.id <= 5) assert.equal(cfg.timeLimit, 0, `L${cfg.id} tutorial band must not hard-fail on time`);
    else assert.ok(cfg.timeLimit >= 90, `L${cfg.id} later levels keep a generous countdown`);
  }
});

test("every level is a square orthogonal maze with no south shaft", () => {
  for (const cfg of LEVELS) {
    const maze = generateMaze(cfg);
    assertSquare(maze, cfg.id);
    assertOrtho(maze, cfg.id);
    maze.locked = false;
    assert.equal(hasRadialHighway(maze), false, `L${cfg.id} still has a south highway`);
    const hops = cellPathToCenter(maze);
    assert.ok(hops, `L${cfg.id} has no cell path to the center`);
    const minHops = minCellHops(cfg);
    assert.ok(
      hops.length - 1 >= minHops,
      `L${cfg.id} cell path ${hops.length - 1} hops < min ${minHops} (grid=${cfg.gridN})`,
    );
    if (cfg.id === 1) {
      assert.equal(cfg.gridN, 9);
      assert.ok(hops.length - 1 <= 14, `L1 hops ${hops.length - 1} still too long for a 20–40s tutorial`);
    }
    if (cfg.id >= 2 && cfg.id <= 3) {
      assert.equal(cfg.gridN, 11);
      assert.ok(hops.length - 1 <= 22, `L${cfg.id} hops ${hops.length - 1} still too long for a soft tutorial`);
    }
    if (cfg.id >= 8 && cfg.id <= 10) {
      assert.ok(hops.length - 1 >= 32, `L${cfg.id} late-chapter hops ${hops.length - 1} lost the hard curve`);
    }
    assert.ok(maxAlignedInward(maze, hops) <= 2, `L${cfg.id} has a straight corridor shaft`);
    const path = shortestPath(maze, maze.start, maze.hedge - 0.2, false);
    assert.ok(path, `L${cfg.id} (${cfg.title}) has no geometric path to the animal`);
    const minGeo = minGeoSteps(cfg);
    assert.ok(path.steps >= minGeo, `L${cfg.id} geometric steps ${path.steps} < ${minGeo}`);
    const end = path.points[path.points.length - 1]!;
    assert.ok(inCenter(end, maze.hedge - 0.08), `L${cfg.id} path does not finish at the courtyard`);
    assert.ok(dist(path.points[0]!, maze.start) < 1.2, `L${cfg.id} path does not start at the south gate`);
    const mouths = courtMouths(maze);
    assert.equal(mouths.length, 1, `L${cfg.id} chamber mouths=${mouths.length}`);
    const mc = maze.cells[mouths[0]!.mazeId]!;
    const cc = maze.cells[mouths[0]!.courtId]!;
    assert.ok(mc.gy <= cc.gy, `L${cfg.id} chamber mouth opens south`);
    assertGaps(maze, cfg.id);
  }
});

test("chapter 2 keys are reachable, then the cage opens", () => {
  for (const cfg of LEVELS.filter((l) => l.needsKey)) {
    const maze = generateMaze(cfg);
    assert.ok(maze.keyPos, `L${cfg.id} missing key`);
    const key = maze.keyPos!;
    assert.ok(!inCenter(key, maze.hedge + 0.2), `L${cfg.id} key sits inside the cage`);
    maze.locked = true;
    const toKey = shortestPath(maze, maze.start, (p) => dist(p, key) < 0.55, true);
    assert.ok(toKey, `L${cfg.id} key is not walkable from the south gate`);
    maze.locked = false;
    const toCenter = shortestPath(maze, key, maze.hedge - 0.2, false);
    assert.ok(toCenter, `L${cfg.id} cannot reach the animal after picking the key`);
  }
});

test("chapter 3 chaser spawns away from the start on walkable floor", () => {
  for (const cfg of LEVELS.filter((l) => l.hasChaser)) {
    const maze = generateMaze(cfg);
    assert.ok(dist(maze.chaserSpawn, maze.start) > maze.outerR * 0.5, `L${cfg.id} chaser too close to start`);
    maze.locked = false;
    const path = shortestPath(maze, maze.chaserSpawn, maze.hedge - 0.2, false);
    assert.ok(path, `L${cfg.id} chaser spawn is not on the walkable graph`);
  }
});

test("检修口 punch cuts real orthogonal geometry", () => {
  const maze = generateMaze(LEVELS[0]!);
  const wall = maze.strokes.find((s) => s.kind === "seg" && !isApproachSeg(maze, s));
  assert.ok(wall && wall.kind === "seg");
  const hit = { x: (wall.a.x + wall.b.x) * 0.5, y: (wall.a.y + wall.b.y) * 0.5 };
  const before = maze.strokes.length;
  assert.equal(punchHole(maze, hit), true);
  const still = maze.strokes.some(
    (s) =>
      s.kind === "seg" &&
      Math.abs(s.a.x - wall.a.x) < 1e-6 &&
      Math.abs(s.a.y - wall.a.y) < 1e-6 &&
      Math.abs(s.b.x - wall.b.x) < 1e-6 &&
      Math.abs(s.b.y - wall.b.y) < 1e-6,
  );
  assert.equal(still, false, "检修口 left the original wall intact");
  assert.ok(before > 0);
});

test("south gate has a one-hop walkable neighbor", () => {
  const maze = generateMaze(LEVELS[0]!);
  const start = maze.startCell;
  const n = [...maze.cells[start]!.links][0];
  assert.ok(n !== undefined);
  const path = cellPathFrom(maze, start, (id) => id === n, false);
  assert.ok(path && path.length === 2, "start should link to an adjacent cell");
});

test("level patterns A–F are encoded in the generated graphs", () => {
  for (const cfg of LEVELS) {
    const maze = generateMaze(cfg);
    const path = cellPathToCenter(maze);
    assert.ok(path, `L${cfg.id} missing cell path`);
    const hops = path.length - 1;
    assert.ok(pathTurns(maze, path) >= (cfg.pattern === "A" ? 1 : 2), `L${cfg.id} shortest path has too few turns`);
    if (cfg.pattern !== "A") {
      assert.equal(hasAwayIsNear(maze, path), true, `L${cfg.id} missing away-is-near (C)`);
    }
    const ends = deadEndLengths(maze.cells, maze.startCell);
    const hair = ends.filter((n) => n <= 1).length;
    const longest = ends.length ? Math.max(...ends) : 0;
    if (cfg.pattern === "A") {
      assert.ok(longest <= 3, `L${cfg.id} A dead-end ${longest} too long`);
      assert.ok(hair <= 1, `L${cfg.id} A hairline stubs ${hair}`);
    }
    if (cfg.pattern === "B") {
      assert.equal(hair, 0, `L${cfg.id} B still has hairline stubs`);
      assert.ok(longest >= Math.max(3, Math.ceil(hops * 0.3)), `L${cfg.id} B bait ${longest} vs hops ${hops}`);
    }
    if (cfg.pattern === "D") {
      assert.equal(seesIsolationEarly(maze), true, `L${cfg.id} D isolation not seen early`);
    }
    if (cfg.pattern === "E") {
      assert.ok(maze.keyPos, `L${cfg.id} E missing 值班钥匙`);
      assert.equal(keyOppositeDoor(maze), true, `L${cfg.id} key not opposite isolation door`);
    }
    if (cfg.pattern === "F") {
      assert.equal(cfg.hasChaser, true);
      assert.ok(cfg.gridN <= 15);
      assert.ok(maze.grass.length >= 1, `L${cfg.id} missing 隐藏草`);
    } else {
      assert.equal(maze.grass.length, 0);
    }
  }
});

function isApproachSeg(maze: Maze, s: Extract<Maze["strokes"][number], { kind: "seg" }>): boolean {
  const ap = maze.approach;
  return (
    (Math.abs(s.a.x - ap.x0) < 0.05 && Math.abs(s.b.x - ap.x0) < 0.05) ||
    (Math.abs(s.a.x - ap.x1) < 0.05 && Math.abs(s.b.x - ap.x1) < 0.05) ||
    (Math.abs(s.a.y - ap.y1) < 0.05 && Math.abs(s.b.y - ap.y1) < 0.05)
  );
}

function assertSquare(maze: Maze, id: number): void {
  const n = maze.config.gridN;
  assert.equal(maze.cells.length, n * n, `L${id} is not a full ${n}×${n} square`);
  assert.equal(
    maze.strokes.filter((s) => s.kind === "arc" || s.kind === "radial").length,
    0,
    `L${id} still has circular/polar walls`,
  );
  const start = maze.cells[maze.startCell]!;
  assert.equal(start.gy, n - 1, `L${id} start is not on the south edge`);
  const half = n * maze.cellSize * 0.5;
  assert.ok(Math.abs(maze.outerR - half) < 0.05, `L${id} board half ${maze.outerR} != ${half}`);
}

function assertOrtho(maze: Maze, id: number): void {
  const segs = maze.strokes.filter((s): s is Extract<Maze["strokes"][number], { kind: "seg" }> => s.kind === "seg");
  assert.ok(segs.length > 8, `L${id} has too few orthogonal walls`);
  let axis = 0;
  for (const s of segs) {
    if (Math.abs(s.a.x - s.b.x) < 0.04 || Math.abs(s.a.y - s.b.y) < 0.04) axis += 1;
  }
  assert.ok(axis / segs.length > 0.95, `L${id} interior is not axis-aligned (${axis}/${segs.length})`);
  const mazeCells = maze.cells.filter((c) => !c.courtyard);
  const branches = mazeCells.filter(
    (c) => [...c.links].filter((n) => n >= 0 && !maze.cells[n]!.courtyard).length >= 3,
  );
  assert.ok(branches.length >= 1, `L${id} has no T/4-way junctions`);
}

function assertGaps(maze: Maze, id: number): void {
  const minGap = maze.config.wallWidth + MIN_CORRIDOR * 0.5;
  const hs = maze.strokes.filter(
    (s): s is Extract<Maze["strokes"][number], { kind: "seg" }> => s.kind === "seg" && Math.abs(s.a.y - s.b.y) < 1e-3,
  );
  hs.sort((a, b) => a.a.y - b.a.y);
  for (let i = 1; i < hs.length; i++) {
    const a = hs[i - 1]!;
    const b = hs[i]!;
    const gap = Math.abs(b.a.y - a.a.y);
    if (gap < 1e-4) continue;
    const ov = overlap1d(a.a.x, a.b.x, b.a.x, b.b.x);
    if (ov < 0.2) continue;
    assert.ok(gap + 1e-6 >= minGap, `L${id} near-double H walls gap=${gap.toFixed(3)}`);
  }
}

function overlap1d(a0: number, a1: number, b0: number, b1: number): number {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return Math.max(0, hi - lo);
}
