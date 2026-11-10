import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GOAL, MAZE_GRID, PLAYER_RADIUS, START, deadEnds, junctions, shortestPath } from "./maze";
import { circleBlocked, createWalker, moveCircle, stepWalker } from "./motion";
import { HUNTER_URL, FACING_SHEET_COUNT, WALK_FRAME_COUNT } from "./art";
import { revealRect, shouldCutaway, wallDepth, wallSilhouette, walkerDepth } from "./occlusion";
import { cardinalFromFacing, facingRead, footPair, gait } from "./paper-hunter";
import { isRgbaPng, sheetFrame, wallTallerThanHunter } from "./walk-sheets";

test("maze branches, has a dead end that is not the flag, and reaches the flag", () => {
  const path = shortestPath();
  assert.ok(path && path.length > 8, "start must reach the flag");
  assert.ok(junctions().length >= 2, "need real junctions, not one corridor");
  const ends = deadEnds().filter((p) => p.c !== GOAL.c || p.r !== GOAL.r);
  assert.ok(ends.length >= 1, "need a dead end besides the flag");
  assert.equal(circleBlocked(MAZE_GRID, START.x, START.y, PLAYER_RADIUS), false);
  assert.equal(circleBlocked(MAZE_GRID, GOAL.x, GOAL.y, PLAYER_RADIUS), false);
});

test("border is solid", () => {
  const h = MAZE_GRID.length;
  const w = MAZE_GRID[0]!.length;
  for (let c = 0; c < w; c++) {
    assert.equal(MAZE_GRID[0]![c], 1);
    assert.equal(MAZE_GRID[h - 1]![c], 1);
  }
  for (let r = 0; r < h; r++) {
    assert.equal(MAZE_GRID[r]![0], 1);
    assert.equal(MAZE_GRID[r]![w - 1], 1);
  }
});

test("head-on wall stops and a parallel hold slides", () => {
  const into = moveCircle(MAZE_GRID, START.x, START.y, 5, 0, PLAYER_RADIUS);
  assert.ok(into.x > START.x);
  assert.ok(into.x < 4, `tunneled or passed the east wall: ${into.x}`);
  assert.equal(circleBlocked(MAZE_GRID, into.x, into.y, PLAYER_RADIUS), false);

  let pressed = { x: START.x, y: START.y };
  for (let i = 0; i < 40; i++) pressed = moveCircle(MAZE_GRID, pressed.x, pressed.y, 0, -0.02, PLAYER_RADIUS);
  const slide = stepWalker({ ...createWalker(), x: pressed.x, y: pressed.y }, { x: 1, y: -1 }, 1 / 20);
  assert.ok(slide.x > pressed.x, "east component should apply");
  assert.ok(Math.abs(slide.y - pressed.y) < 0.01, `north into the wall should not move (${pressed.y} -> ${slide.y})`);
  assert.equal(slide.flip, false);
  assert.ok(Math.abs(slide.facing) < 0.35);
});

test("a long step does not tunnel through a one-cell wall", () => {
  const tun = moveCircle(MAZE_GRID, 3.5, 3.5, 0, 6, PLAYER_RADIUS);
  assert.ok(tun.y > 3 && tun.y < 4, `crossed the wall: ${tun.y}`);
  assert.equal(circleBlocked(MAZE_GRID, tun.x, tun.y, PLAYER_RADIUS), false);
});

test("pushes at the outer wall stay inside", () => {
  const north = moveCircle(MAZE_GRID, START.x, START.y, 0, -8, PLAYER_RADIUS);
  assert.ok(north.y > 1, `left the board: ${north.y}`);
  const west = moveCircle(MAZE_GRID, START.x, START.y, -8, 0, PLAYER_RADIUS);
  assert.ok(west.x > 1, `left the board: ${west.x}`);
  assert.equal(circleBlocked(MAZE_GRID, north.x, north.y, PLAYER_RADIUS), false);
  assert.equal(circleBlocked(MAZE_GRID, west.x, west.y, PLAYER_RADIUS), false);
});

test("facing follows the slide, and walk phase tracks distance", () => {
  const west = stepWalker({ ...createWalker(), x: 3.5, y: 1.5 }, { x: -1, y: 0 }, 1 / 20);
  assert.equal(west.flip, true);
  assert.ok(west.facing > 2.5 || west.facing < -2.5);

  const south = stepWalker({ ...createWalker(), x: 5.5, y: 5.5 }, { x: 0, y: 1 }, 1 / 20);
  assert.ok(south.y > 5.5);
  assert.ok(Math.sin(south.facing) > 0.7);
  assert.equal(south.flip, false);

  const idle = stepWalker(createWalker(), { x: 0, y: 0 }, 0.05);
  assert.equal(idle.phase, 0);
  assert.equal(idle.moving, false);
  const walked = stepWalker(createWalker(), { x: 1, y: 0 }, 0.05);
  assert.ok(walked.phase > 0);
  assert.equal(walked.moving, true);
});

test("following the floor path reaches the flag without entering a wall", () => {
  const path = shortestPath();
  assert.ok(path);
  let w = createWalker();
  for (let i = 1; i < path.length; i++) {
    const target = path[i]!;
    for (let n = 0; n < 90 && !w.won; n++) {
      const dx = target.x - w.x;
      const dy = target.y - w.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.04) break;
      w = stepWalker(w, { x: dx / d, y: dy / d }, 1 / 60);
      assert.equal(circleBlocked(MAZE_GRID, w.x, w.y, PLAYER_RADIUS), false, `${w.x},${w.y}`);
    }
    if (!w.won) {
      assert.ok(
        Math.hypot(w.x - target.x, w.y - target.y) < 0.12,
        `stuck before ${target.x},${target.y} at ${w.x},${w.y}`,
      );
    }
  }
  assert.equal(w.won, true);
});

test("hunter png is one pose, so the walker is a drawn figure with four reads", () => {
  assert.equal(HUNTER_URL, "art/hunter.png");
  assert.equal(HUNTER_URL.endsWith(".jpg"), false);
  assert.equal(FACING_SHEET_COUNT, 0);
  assert.equal(WALK_FRAME_COUNT, 0);
  assert.equal(cardinalFromFacing(0), "E");
  assert.equal(cardinalFromFacing(Math.PI / 2), "S");
  assert.equal(cardinalFromFacing(Math.PI), "W");
  assert.equal(cardinalFromFacing(-Math.PI / 2), "N");
  const reads = (["N", "E", "S", "W"] as const).map((d) => JSON.stringify(facingRead(d)));
  assert.equal(new Set(reads).size, 4);
  assert.equal(facingRead("N").eyes, 0);
  assert.equal(facingRead("S").eyes, 2);
  assert.equal(facingRead("E").nose, 1);
  assert.equal(facingRead("W").nose, -1);
});

test("gait plants one foot and swings the other without lifting the hips", () => {
  for (const phase of [0, 0.4, 1.2, Math.PI, 4]) {
    const g = gait(phase, true);
    assert.equal(g.hipLift, 0);
    assert.notEqual(g.back.planted, g.front.planted);
    assert.ok(g.front.along - g.back.along > 0.15, `stride too small at ${phase}`);
  }
  const wide = gait(0.15, true);
  assert.ok(wide.front.along - wide.back.along > 0.8);
  const [a0, a1] = footPair(0.15);
  const [b0, b1] = footPair(Math.PI + 0.15);
  assert.ok(Math.abs(a0.along - b1.along) < 0.02);
  assert.ok(Math.abs(a1.along - b0.along) < 0.02);
  assert.notEqual(a0.planted, a1.planted);
  const idle = gait(1, false);
  assert.equal(idle.hipLift, 0);
  assert.equal(idle.back.planted && idle.front.planted, true);
  assert.equal(idle.back.lift, 0);
  assert.equal(idle.front.lift, 0);
});

test("walls are taller than the hunter body", () => {
  assert.equal(wallTallerThanHunter(), true);
});

test("only an 8-bit RGBA PNG is a walk sheet", () => {
  const png = new Uint8Array(26);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png[24] = 8;
  png[25] = 6;
  assert.equal(isRgbaPng(png), true);
  png[25] = 2;
  assert.equal(isRgbaPng(png), false);
  assert.equal(isRgbaPng(new Uint8Array([0xff, 0xd8, 0xff])), false);
  assert.equal(sheetFrame(0, false), 0);
  assert.equal(sheetFrame(Math.PI, true), 2);
});

test("only a foreground prism that covers the hunter is opened", () => {
  const scale = 100;
  const raise = 175;
  const hunter = revealRect(0, 40, 50, 90, 20);
  const cover = wallSilhouette(0, 0, scale, -50, 80, raise);
  const aside = wallSilhouette(6, 0, scale, -50, 80, raise);
  assert.equal(shouldCutaway(8, 5, cover, hunter), true);
  assert.equal(shouldCutaway(4, 5, cover, hunter), false);
  assert.equal(shouldCutaway(8, 5, aside, hunter), false);
  assert.ok(wallDepth(3, 4) > walkerDepth(3.2, 2.2));
  assert.ok(wallDepth(3, 1) < walkerDepth(3.2, 2.2));
  const top = wallSilhouette(0, 0, scale, 0, 0, raise)[0]!;
  const base = wallSilhouette(0, 0, scale, 0, 0, raise)[3]!;
  assert.ok(base.y - top.y > 90);
});

test("default entry constructs the freewalk maze, not GO", () => {
  const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const play = readFileSync(new URL("./play.ts", import.meta.url), "utf8");
  assert.match(main, /new WalkMode\(\)/);
  assert.match(main, /bootLegacy/);
  assert.doesNotMatch(main, /new GoMode|go\.open|new Game\(/);
  assert.match(play, /walk-pad-n/);
  assert.match(play, /ArrowUp/);
  assert.match(play, /HUNTER_URL/);
  assert.match(play, /shouldCutaway/);
  assert.doesNotMatch(play, /drawPaperHunter/);
  assert.doesNotMatch(play, /leanFromFacing/);
  assert.doesNotMatch(html, /Hitman GO|点相邻节点|点相邻格子/);
  assert.match(html, /walk-mode/);
});
