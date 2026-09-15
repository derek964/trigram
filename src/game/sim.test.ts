import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVELS } from "./levels";
import { coveredLosCells, generateMaze, openLosCells } from "./maze";
import { simulateCatch, simulateGrassLos, simulateLevel } from "./sim";

test("optimal agent clears L1, L11, L21 in key order", () => {
  for (const id of [1, 11, 21]) {
    const row = simulateLevel(LEVELS[id - 1]!);
    assert.equal(row.optOk, true, `L${id} optimal miss (${row.note})`);
    assert.ok(row.optSteps > 0);
  }
});

test("防盗夜 隐藏草 breaks LOS and the thief can still catch", () => {
  for (const cfg of LEVELS.filter((l) => l.hasChaser)) {
    const maze = generateMaze(cfg);
    assert.ok(maze.grass.length >= 1, `L${cfg.id} missing 隐藏草`);
    assert.ok(openLosCells(maze).length >= 1, `L${cfg.id} grass sealed every LOS`);
    assert.ok(coveredLosCells(maze).length >= 1, `L${cfg.id} grass blocks no LOS`);
    assert.equal(simulateGrassLos(maze), true, `L${cfg.id} grass LOS test`);
    assert.equal(simulateCatch(maze, () => 0.37), true, `L${cfg.id} thief never caught a sitting player`);
  }
});
