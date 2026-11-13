/**
 * Fail-loud CI/QA gate: every explore+chase GO level must BFS-solve
 * birth → cage pickup → camp. Exit 1 on first bad seed.
 *
 *   npm run solvability
 */
import { GO_LEVELS } from "./levels";
import { assertLevelSolvable } from "./solvability";

function main(): void {
  console.log(`solvability gate · ${GO_LEVELS.length} levels`);
  const rows: { id: number; mode: string; depth: number; states: number; seed: number }[] = [];
  for (const lv of GO_LEVELS) {
    const max = lv.mode === "chase" ? 120_000 : 80_000;
    const r = assertLevelSolvable(lv, max);
    rows.push({ id: lv.id, mode: lv.mode, depth: r.depth, states: r.states, seed: lv.mazeSeed });
    console.log(
      `  PASS L${lv.id} ${lv.mode} ${lv.name} depth=${r.depth} states=${r.states} seed=${lv.mazeSeed} pathHops=${r.path.length}`,
    );
  }
  const chase = rows.filter((x) => x.mode === "chase");
  const explore = rows.filter((x) => x.mode === "explore");
  if (explore.length !== 4 || chase.length !== 4) {
    throw new Error(`expected 4 explore + 4 chase, got ${explore.length}+${chase.length}`);
  }
  console.log("ALL PASS · birth→cage→camp");
}

try {
  main();
} catch (err) {
  console.error("FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
}
